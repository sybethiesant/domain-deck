const https = require('https');
const querystring = require('querystring');

// Balance management constants
const CC_FEE_PERCENT = 0.05;  // eNom charges 5% for CC refills
const MIN_REFILL = 25.00;     // Minimum refill amount allowed by eNom

class EnomAPI {
  constructor() {
    this.uid = process.env.ENOM_UID;
    this.pw = process.env.ENOM_PW;
    this.env = process.env.ENOM_ENV || 'test';

    // Set API endpoint based on environment
    this.baseUrl = this.env === 'production'
      ? 'reseller.enom.com'
      : 'resellertest.enom.com';
  }


  /**
   * Sanitize URL for logging (removes credentials)
   * @param {string} url - URL with query parameters
   * @returns {string} - Sanitized URL safe for logging
   */
  sanitizeUrl(url) {
    return url.replace(/pw=[^&]+/, 'pw=***REDACTED***')
              .replace(/uid=[^&]+/, 'uid=***');
  }

  /**
   * Make an API request to eNom
   * @param {string} command - The eNom command to execute
   * @param {object} params - Additional parameters for the command
   * @returns {Promise<object>} - Parsed response
   */
  async request(command, params = {}) {
    const queryParams = {
      command,
      uid: this.uid,
      pw: this.pw,
      // Use text format - JSON is broken on eNom's side
      ...params
    };

    const queryString = querystring.stringify(queryParams);
    const url = `/interface.asp?${queryString}`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: url,
        method: 'GET',
        headers: {
          'User-Agent': 'WorxTech/1.0'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            // Parse text format response (key=value pairs)
            const response = this.parseTextResponse(data);

            // Check for errors
            if (response.ErrCount && parseInt(response.ErrCount) > 0) {
              const errors = [];
              for (let i = 1; i <= parseInt(response.ErrCount); i++) {
                if (response[`Err${i}`]) {
                  errors.push(response[`Err${i}`]);
                }
              }
              reject(new Error(errors.join(', ') || 'Unknown eNom error'));
              return;
            }

            resolve(response);
          } catch (e) {
            // Try to extract error from response
            if (data.includes('Error')) {
              reject(new Error(`eNom API Error: ${data.substring(0, 200)}`));
            } else {
              reject(new Error(`Failed to parse eNom response: ${e.message}`));
            }
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`eNom request failed: ${error.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('eNom request timeout'));
      });

      req.end();
    });
  }

  /**
   * Parse eNom text format response into an object
   * @param {string} text - Raw text response
   * @returns {object} - Parsed key-value pairs
   */
  parseTextResponse(text) {
    const result = {};
    const lines = text.split('\n');

    for (const line of lines) {
      // Skip comment lines (starting with ;)
      if (line.startsWith(';') || !line.includes('=')) {
        continue;
      }

      const eqIndex = line.indexOf('=');
      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim();

      if (key) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Check if a single domain is available
   * @param {string} sld - Second level domain (e.g., 'example')
   * @param {string} tld - Top level domain (e.g., 'com')
   * @returns {Promise<object>} - Availability result
   */
  async checkDomain(sld, tld) {
    try {
      const response = await this.request('Check', { sld, tld });

      // eNom returns RRPCode: 210 for available, 211 for not available
      const available = response.RRPCode === '210';
      const premium = response.IsPremiumName === 'true' || response.IsPremiumName === '1';

      return {
        available,
        premium,
        premiumPrice: premium ? parseFloat(response.PremiumPrice || 0) : null,
        rrpCode: response.RRPCode,
        message: response.RRPText || ''
      };
    } catch (error) {
      console.error(`eNom check error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Check multiple domains at once
   * @param {Array<{sld: string, tld: string}>} domains - Array of domain objects
   * @returns {Promise<Array>} - Array of availability results
   */
  async checkDomainBulk(domains) {
    // eNom supports checking multiple TLDs for the same SLD
    // Group by SLD for efficiency
    const results = [];

    for (const domain of domains) {
      try {
        const result = await this.checkDomain(domain.sld, domain.tld);
        results.push({
          sld: domain.sld,
          tld: domain.tld,
          domain: `${domain.sld}.${domain.tld}`,
          ...result
        });
      } catch (error) {
        results.push({
          sld: domain.sld,
          tld: domain.tld,
          domain: `${domain.sld}.${domain.tld}`,
          available: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get retail pricing for a TLD
   * @param {string} tld - Top level domain
   * @param {string} productType - 'register', 'renew', 'transfer'
   * @returns {Promise<object>} - Pricing info
   */
  async getRetailPrice(tld, productType = 'register') {
    try {
      const response = await this.request('PE_GetProductPrice', {
        ProductType: productType === 'register' ? 10 : (productType === 'renew' ? 16 : 19),
        TLD: tld
      });

      return {
        tld,
        productType,
        price: parseFloat(response.Price || 0),
        currency: 'USD'
      };
    } catch (error) {
      console.error(`eNom pricing error for ${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get reseller cost pricing for a TLD
   * @param {string} tld - Top level domain
   * @param {string} productType - 'register', 'renew', 'transfer'
   * @returns {Promise<object>} - Cost pricing info
   */
  async getResellerPrice(tld, productType = 'register') {
    try {
      // ProductType: 10=Register, 16=Renew, 19=Transfer
      const productTypeCode = productType === 'register' ? 10 : (productType === 'renew' ? 16 : 19);

      const response = await this.request('PE_GetResellerPrice', {
        ProductType: productTypeCode,
        TLD: tld
      });

      return {
        tld,
        productType,
        cost: parseFloat(response.Price || response.price || 0),
        currency: 'USD'
      };
    } catch (error) {
      console.error(`eNom reseller pricing error for ${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get pricing for all supported TLDs
   * @returns {Promise<Array>} - Array of TLD pricing objects
   */
  async getTLDList() {
    try {
      const response = await this.request('PE_GetTLDList', {});

      const tlds = [];
      const tldList = response.tldlist?.tld || response.TLDList?.TLD || [];
      const tldArray = Array.isArray(tldList) ? tldList : [tldList];

      for (const t of tldArray) {
        if (t && (t.tld || t.TLD)) {
          tlds.push({
            tld: (t.tld || t.TLD).toLowerCase(),
            minYears: parseInt(t.MinRegPeriod || t.minregperiod || 1),
            maxYears: parseInt(t.MaxRegPeriod || t.maxregperiod || 10),
            transferSupported: t.TransferSupported !== 'False'
          });
        }
      }

      return tlds;
    } catch (error) {
      console.error('eNom get TLD list error:', error.message);
      throw error;
    }
  }

  /**
   * Get complete pricing for a TLD (register, renew, transfer costs)
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Complete pricing info
   */
  async getTLDPricing(tld) {
    try {
      const [registerCost, renewCost, transferCost] = await Promise.all([
        this.getResellerPrice(tld, 'register').catch(() => ({ cost: 0 })),
        this.getResellerPrice(tld, 'renew').catch(() => ({ cost: 0 })),
        this.getResellerPrice(tld, 'transfer').catch(() => ({ cost: 0 }))
      ]);

      return {
        tld,
        cost_register: registerCost.cost,
        cost_renew: renewCost.cost,
        cost_transfer: transferCost.cost,
        currency: 'USD'
      };
    } catch (error) {
      console.error(`eNom pricing error for ${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Register a new domain
   * @param {object} params - Registration parameters
   * @returns {Promise<object>} - Registration result
   */
  async registerDomain(params) {
    const {
      sld,
      tld,
      years = 1,
      nameservers = [],
      registrant,
      admin,
      tech,
      billing,
      privacy = false
    } = params;

    const requestParams = {
      sld,
      tld,
      NumYears: years,
      UseDNS: nameservers.length > 0 ? 'default' : 'default'
    };

    // Add nameservers
    nameservers.forEach((ns, index) => {
      requestParams[`NS${index + 1}`] = ns;
    });

    // Add registrant contact
    if (registrant) {
      Object.assign(requestParams, this.formatContact(registrant, 'Registrant'));
    }

    // Add admin contact (or use registrant)
    const adminContact = admin || registrant;
    if (adminContact) {
      Object.assign(requestParams, this.formatContact(adminContact, 'Admin'));
    }

    // Add tech contact (or use registrant)
    const techContact = tech || registrant;
    if (techContact) {
      Object.assign(requestParams, this.formatContact(techContact, 'Tech'));
    }

    // Add billing contact (or use registrant)
    const billingContact = billing || registrant;
    if (billingContact) {
      Object.assign(requestParams, this.formatContact(billingContact, 'AuxBilling'));
    }

    // Add privacy if requested
    if (privacy) {
      requestParams.WPPSEmail = registrant.email;
    }

    try {
      const response = await this.request('Purchase', requestParams);

      return {
        success: true,
        orderId: response.OrderID,
        domainName: `${sld}.${tld}`,
        status: response.DomainStatus || 'registered',
        expirationDate: response.ExpirationDate
      };
    } catch (error) {
      console.error(`eNom registration error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Renew a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {number} years - Number of years to renew
   * @returns {Promise<object>} - Renewal result
   */
  async renewDomain(sld, tld, years = 1) {
    try {
      const response = await this.request('Extend', {
        sld,
        tld,
        NumYears: years
      });

      return {
        success: true,
        orderId: response.OrderID,
        domainName: `${sld}.${tld}`,
        newExpiration: response.ExpirationDate
      };
    } catch (error) {
      console.error(`eNom renewal error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Update nameservers for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {Array<string>} nameservers - Array of nameserver hostnames
   * @returns {Promise<object>} - Update result
   */
  async updateNameservers(sld, tld, nameservers) {
    const params = { sld, tld };

    nameservers.forEach((ns, index) => {
      params[`NS${index + 1}`] = ns;
    });

    try {
      const response = await this.request('ModifyNS', params);

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        nameservers
      };
    } catch (error) {
      console.error(`eNom NS update error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get current nameservers for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<Array>} - Array of nameservers
   */
  async getNameservers(sld, tld) {
    try {
      const response = await this.request('GetDNS', { sld, tld });

      const nameservers = [];
      for (let i = 1; i <= 13; i++) {
        if (response[`DNS${i}`]) {
          nameservers.push(response[`DNS${i}`]);
        }
      }

      return nameservers;
    } catch (error) {
      console.error(`eNom get NS error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get domain info (basic info from GetDomainInfo)
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Domain information
   */
  async getDomainInfo(sld, tld) {
    try {
      const response = await this.request('GetDomainInfo', { sld, tld });

      return {
        domainName: `${sld}.${tld}`,
        domainNameId: response.domainnameid,
        status: response.registrationstatus || 'Unknown',
        expirationDate: response.expiration,
        registrar: response.registrar
      };
    } catch (error) {
      console.error(`eNom domain info error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get comprehensive domain data from multiple eNom endpoints
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Complete domain data
   */
  async getFullDomainData(sld, tld) {
    const result = {
      domainName: `${sld}.${tld}`,
      sld,
      tld,
      expirationDate: null,
      status: null,
      autoRenew: false,
      lockStatus: false,
      privacyEnabled: false,
      nameservers: []
    };

    // Fetch all data in parallel for speed
    const [infoResult, nsResult, lockResult, renewResult, privacyResult] = await Promise.allSettled([
      this.request('GetDomainInfo', { sld, tld }),
      this.request('GetDNS', { sld, tld }),
      this.request('GetRegLock', { sld, tld }),
      this.request('GetRenew', { sld, tld }),
      this.request('GetWPPSInfo', { sld, tld })
    ]);

    // Parse domain info
    if (infoResult.status === 'fulfilled') {
      const info = infoResult.value;
      result.domainNameId = info.domainnameid;
      result.expirationDate = info.expiration;
      result.status = info.registrationstatus || 'Unknown';
      result.registrar = info.registrar;
    }

    // Parse nameservers
    if (nsResult.status === 'fulfilled') {
      const ns = nsResult.value;
      for (let i = 1; i <= 13; i++) {
        if (ns[`DNS${i}`]) {
          result.nameservers.push(ns[`DNS${i}`]);
        }
      }
    }

    // Parse lock status
    if (lockResult.status === 'fulfilled') {
      result.lockStatus = lockResult.value.RegLock === '1' || lockResult.value['reg-lock'] === '1';
    }

    // Parse auto-renew
    if (renewResult.status === 'fulfilled') {
      result.autoRenew = renewResult.value.RenewName === '1' || renewResult.value.AutoRenew === '1';
    }

    // Parse privacy status
    if (privacyResult.status === 'fulfilled') {
      result.privacyEnabled = privacyResult.value.WPPSEnabled === '1';
    }

    return result;
  }

  /**
   * Enable/disable WHOIS privacy
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {boolean} enable - Enable or disable privacy
   * @returns {Promise<object>} - Result
   */
  async setWhoisPrivacy(sld, tld, enable) {
    try {
      const command = enable ? 'EnableServices' : 'DisableServices';
      const response = await this.request(command, {
        sld,
        tld,
        Service: 'WPPS'
      });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        privacyEnabled: enable
      };
    } catch (error) {
      console.error(`eNom privacy error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get WHOIS contact information
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Contact information
   */
  async getWhoisContacts(sld, tld) {
    try {
      const response = await this.request('GetContacts', { sld, tld });

      return {
        registrant: this.parseContact(response, 'Registrant'),
        admin: this.parseContact(response, 'Admin'),
        tech: this.parseContact(response, 'Tech'),
        billing: this.parseContact(response, 'AuxBilling')
      };
    } catch (error) {
      console.error(`eNom contacts error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all domains in the reseller account
   * @returns {Promise<Array>} - Array of domain objects
   */
  async getAllDomains() {
    try {
      const response = await this.request('GetDomains', {});

      const domains = [];
      const domainList = response['GetDomains']?.['domain-list']?.domain || response.DomainList?.domain || [];

      const domainArray = Array.isArray(domainList) ? domainList : [domainList];

      for (const d of domainArray) {
        if (d && d.sld && d.tld) {
          domains.push({
            domainNameId: d.DomainNameID,
            sld: d.sld,
            tld: d.tld,
            domain: `${d.sld}.${d.tld}`,
            expirationDate: d['expiration-date'],
            autoRenew: d['auto-renew'] === 'Yes',
            privacyEnabled: d.wppsstatus !== 'disabled' && d.wppsstatus !== 'n/a'
          });
        }
      }

      return domains;
    } catch (error) {
      console.error('eNom get all domains error:', error.message);
      throw error;
    }
  }

  /**
   * Get sub-accounts
   * @returns {Promise<Array>} - Array of sub-account objects
   */
  async getSubAccounts() {
    try {
      const response = await this.request('GetSubAccounts', {});

      const accounts = [];
      const subAccounts = response.SubAccounts?.SubAccount || [];

      const accountArray = Array.isArray(subAccounts) ? subAccounts : [subAccounts];

      for (const sa of accountArray) {
        if (sa && sa.LoginID) {
          accounts.push({
            accountId: sa.Account,
            loginId: sa.LoginID,
            partyId: sa.PartyID,
            firstName: sa.FName,
            lastName: sa.LName,
            email: sa.EmailAddress,
            domainCount: parseInt(sa.DomainCount) || 0
          });
        }
      }

      return accounts;
    } catch (error) {
      console.error('eNom get sub-accounts error:', error.message);
      throw error;
    }
  }

  /**
   * Get account balance
   * @returns {Promise<object>} - Balance info
   */
  async getBalance() {
    try {
      const response = await this.request('GetBalance');

      return {
        balance: parseFloat(response.Balance || 0),
        currency: 'USD'
      };
    } catch (error) {
      console.error('eNom balance error:', error.message);
      throw error;
    }
  }

  /**
   * Initiate a domain transfer
   * @param {object} params - Transfer parameters
   * @returns {Promise<object>} - Transfer result
   */
  async initiateTransfer(params) {
    const {
      sld,
      tld,
      authCode,
      registrant,
      admin,
      tech,
      billing,
      years = 1
    } = params;

    const requestParams = {
      sld,
      tld,
      AuthInfo: authCode,
      DomainPassword: authCode,
      NumYears: years,
      OrderType: 'AutoVerification'
    };

    // Add registrant contact
    if (registrant) {
      Object.assign(requestParams, this.formatContact(registrant, 'Registrant'));
    }

    // Add admin contact (or use registrant)
    const adminContact = admin || registrant;
    if (adminContact) {
      Object.assign(requestParams, this.formatContact(adminContact, 'Admin'));
    }

    // Add tech contact (or use registrant)
    const techContact = tech || registrant;
    if (techContact) {
      Object.assign(requestParams, this.formatContact(techContact, 'Tech'));
    }

    // Add billing contact (or use registrant)
    const billingContact = billing || registrant;
    if (billingContact) {
      Object.assign(requestParams, this.formatContact(billingContact, 'AuxBilling'));
    }

    try {
      const response = await this.request('TP_CreateOrder', requestParams);

      return {
        success: true,
        transferOrderId: response.TransferOrderID || response.transferorderid,
        orderId: response.OrderID,
        domainName: `${sld}.${tld}`,
        status: response.TransferStatus || 'pending',
        statusDescription: response.StatusDesc || 'Transfer initiated'
      };
    } catch (error) {
      console.error(`eNom transfer error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get transfer order status
   * @param {string} transferOrderId - Transfer order ID
   * @returns {Promise<object>} - Transfer status
   */
  async getTransferStatus(transferOrderId) {
    try {
      const response = await this.request('TP_GetOrderDetail', {
        TransferOrderID: transferOrderId
      });

      return {
        transferOrderId,
        status: response.TransferStatus || response.Status,
        statusDescription: response.StatusDesc || response.StatusDescription,
        domainName: response.DomainName,
        orderId: response.OrderID,
        createdDate: response.OrderDate,
        lastUpdated: response.StatusUpdateDate,
        currentRegistrar: response.CurrentRegistrar
      };
    } catch (error) {
      console.error(`eNom transfer status error for ${transferOrderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all pending transfers
   * @returns {Promise<Array>} - Array of pending transfers
   */
  async getPendingTransfers() {
    try {
      const response = await this.request('TP_GetOrder', {});

      const transfers = [];
      const transferList = response.transferorder || response.TransferOrder || [];
      const transferArray = Array.isArray(transferList) ? transferList : [transferList];

      for (const t of transferArray) {
        if (t && t.transferorderid) {
          transfers.push({
            transferOrderId: t.transferorderid,
            domainName: `${t.sld}.${t.tld}`,
            sld: t.sld,
            tld: t.tld,
            status: t.statusid,
            statusDescription: t.statusdesc,
            orderDate: t.orderdate,
            statusDate: t.statusdate
          });
        }
      }

      return transfers;
    } catch (error) {
      console.error('eNom get pending transfers error:', error.message);
      throw error;
    }
  }

  /**
   * Cancel a pending transfer
   * @param {string} transferOrderId - Transfer order ID
   * @returns {Promise<object>} - Cancellation result
   */
  async cancelTransfer(transferOrderId) {
    try {
      const response = await this.request('TP_CancelOrder', {
        TransferOrderID: transferOrderId
      });

      return {
        success: true,
        transferOrderId,
        message: 'Transfer cancelled successfully'
      };
    } catch (error) {
      console.error(`eNom cancel transfer error for ${transferOrderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Resend transfer authorization email
   * @param {string} transferOrderId - Transfer order ID
   * @returns {Promise<object>} - Result
   */
  async resendTransferAuth(transferOrderId) {
    try {
      const response = await this.request('TP_ResendEmail', {
        TransferOrderID: transferOrderId
      });

      return {
        success: true,
        transferOrderId,
        message: 'Authorization email resent'
      };
    } catch (error) {
      console.error(`eNom resend auth error for ${transferOrderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Set domain lock status
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {boolean} lock - Lock or unlock
   * @returns {Promise<object>} - Result
   */
  async setDomainLock(sld, tld, lock) {
    try {
      const command = lock ? 'SetRegLock' : 'UnsetRegLock';
      const response = await this.request(command, {
        sld,
        tld,
        UnlockRegistrar: lock ? '0' : '1'
      });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        locked: lock
      };
    } catch (error) {
      console.error(`eNom lock error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get domain auth code (EPP code) for transfer out
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Auth code
   */
  async getAuthCode(sld, tld) {
    try {
      // First unlock the domain
      await this.setDomainLock(sld, tld, false);

      const response = await this.request('SynchAuthInfo', {
        sld,
        tld,
        EmailEPP: 'False',
        RunSynchAutoInfo: 'True'
      });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        authCode: response.AuthInfo || response.EPPCode
      };
    } catch (error) {
      console.error(`eNom get auth code error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Update domain contacts
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {object} contacts - Contact objects for each type
   * @returns {Promise<object>} - Result
   */
  async updateContacts(sld, tld, contacts) {
    const { registrant, admin, tech, billing } = contacts;

    const requestParams = { sld, tld };

    if (registrant) {
      Object.assign(requestParams, this.formatContact(registrant, 'Registrant'));
    }
    if (admin) {
      Object.assign(requestParams, this.formatContact(admin, 'Admin'));
    }
    if (tech) {
      Object.assign(requestParams, this.formatContact(tech, 'Tech'));
    }
    if (billing) {
      Object.assign(requestParams, this.formatContact(billing, 'AuxBilling'));
    }

    try {
      const response = await this.request('Contacts', requestParams);

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        message: 'Contacts updated successfully'
      };
    } catch (error) {
      console.error(`eNom update contacts error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Set auto-renew status
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {boolean} autoRenew - Enable or disable auto-renew
   * @returns {Promise<object>} - Result
   */
  async setAutoRenew(sld, tld, autoRenew) {
    try {
      const response = await this.request('SetRenew', {
        sld,
        tld,
        RenewFlag: autoRenew ? '1' : '0'
      });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        autoRenew
      };
    } catch (error) {
      console.error(`eNom auto-renew error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Format contact info for eNom API
   * @param {object} contact - Contact object
   * @param {string} prefix - Contact type prefix
   * @returns {object} - Formatted params
   */
  formatContact(contact, prefix) {
    return {
      [`${prefix}FirstName`]: contact.firstName || contact.first_name,
      [`${prefix}LastName`]: contact.lastName || contact.last_name,
      [`${prefix}Organization`]: contact.organization || contact.company || '',
      [`${prefix}Address1`]: contact.address1 || contact.address_line1,
      [`${prefix}Address2`]: contact.address2 || contact.address_line2 || '',
      [`${prefix}City`]: contact.city,
      [`${prefix}StateProvince`]: contact.state || contact.province,
      [`${prefix}PostalCode`]: contact.postalCode || contact.postal_code,
      [`${prefix}Country`]: contact.country || 'US',
      [`${prefix}EmailAddress`]: contact.email,
      [`${prefix}Phone`]: contact.phone
    };
  }

  /**
   * Parse contact info from eNom response
   * @param {object} response - eNom response
   * @param {string} prefix - Contact type prefix
   * @returns {object} - Parsed contact
   */
  parseContact(response, prefix) {
    const getField = (field) => response[`${prefix}${field}`] || response[`${prefix.toLowerCase()}-${field.toLowerCase()}`];

    return {
      firstName: getField('FirstName'),
      lastName: getField('LastName'),
      organization: getField('Organization') || getField('OrgName'),
      address1: getField('Address1'),
      address2: getField('Address2'),
      city: getField('City'),
      state: getField('StateProvince') || getField('State'),
      postalCode: getField('PostalCode'),
      country: getField('Country'),
      email: getField('EmailAddress') || getField('Email'),
      phone: getField('Phone')
    };
  }

  // ============================================
  // BALANCE MANAGEMENT FUNCTIONS
  // ============================================

  /**
   * Get detailed account balance with additional info
   * @returns {Promise<object>} - Detailed balance info
   */
  async getDetailedBalance() {
    try {
      const response = await this.request('GetBalance');
      
      return {
        availableBalance: parseFloat(response.Balance || 0),
        currency: 'USD',
        timestamp: new Date().toISOString(),
        raw: response
      };
    } catch (error) {
      console.error('eNom detailed balance error:', error.message);
      throw error;
    }
  }

  /**
   * Refill account balance using credit card on file
   * @param {number} amount - Amount to refill in USD (minimum $25)
   * @returns {Promise<object>} - Refill result
   */
  async refillAccount(amount) {
    if (amount < MIN_REFILL) {
      throw new Error('Minimum refill amount is $' + MIN_REFILL);
    }

    try {
      const response = await this.request('RefillAccount', {
        Amount: amount.toFixed(2)
      });

      const feeAmount = amount * CC_FEE_PERCENT;
      const netAmount = amount - feeAmount;

      return {
        success: true,
        requestedAmount: amount,
        feePercent: CC_FEE_PERCENT * 100,
        feeAmount: parseFloat(feeAmount.toFixed(2)),
        netAmount: parseFloat(netAmount.toFixed(2)),
        transactionId: response.TransactionID || response.OrderID,
        message: 'Account refilled successfully',
        raw: response
      };
    } catch (error) {
      console.error('eNom refill error:', error.message);
      throw error;
    }
  }

  /**
   * Calculate the refill amount needed for a purchase
   * Accounts for the 5% CC fee
   * @param {number} domainCost - Cost of the domain
   * @param {number} currentBalance - Current account balance
   * @returns {object} - Refill calculation details
   */
  calculateRefillNeeded(domainCost, currentBalance) {
    const shortfall = domainCost - currentBalance;
    
    if (shortfall <= 0) {
      return {
        needsRefill: false,
        shortfall: 0,
        refillAmount: 0,
        netAfterFee: 0,
        reason: 'Balance sufficient'
      };
    }

    // Need to refill enough that after 5% fee, we have enough
    // If we refill X, we get X * 0.95 = shortfall, so X = shortfall / 0.95
    const grossRefillNeeded = shortfall / (1 - CC_FEE_PERCENT);
    
    let refillAmount;
    let reason;
    
    if (grossRefillNeeded > MIN_REFILL) {
      refillAmount = Math.ceil(grossRefillNeeded * 100) / 100;
      reason = 'Refilling exact amount needed';
    } else {
      refillAmount = MIN_REFILL;
      reason = 'Refilling minimum amount ($25)';
    }

    const feeAmount = refillAmount * CC_FEE_PERCENT;
    const netAfterFee = refillAmount - feeAmount;

    return {
      needsRefill: true,
      shortfall: parseFloat(shortfall.toFixed(2)),
      refillAmount: parseFloat(refillAmount.toFixed(2)),
      feeAmount: parseFloat(feeAmount.toFixed(2)),
      netAfterFee: parseFloat(netAfterFee.toFixed(2)),
      reason
    };
  }

  /**
   * Smart domain purchase with automatic balance management
   * @param {object} params - Purchase parameters (same as registerDomain)
   * @param {object} options - Additional options (autoRefill, dryRun)
   * @returns {Promise<object>} - Purchase result with balance details
   */
  async smartPurchase(params, options = {}) {
    const { autoRefill = true, dryRun = false } = options;
    
    const result = { steps: [], success: false };

    try {
      // Step 1: Get current balance
      result.steps.push({ step: 'getBalance', status: 'started' });
      const balanceInfo = await this.getDetailedBalance();
      result.currentBalance = balanceInfo.availableBalance;
      result.steps[result.steps.length - 1].status = 'completed';

      // Step 2: Get domain cost
      const domainCost = params.cost || params.price || 0;
      if (!domainCost) {
        throw new Error('Domain cost must be provided in params.cost or params.price');
      }
      result.domainCost = domainCost;

      // Step 3: Calculate refill needed
      const refillCalc = this.calculateRefillNeeded(domainCost, balanceInfo.availableBalance);
      result.refillCalculation = refillCalc;

      // Step 4: Refill if needed
      if (refillCalc.needsRefill) {
        if (!autoRefill) {
          throw new Error('Insufficient balance. Need $' + domainCost + ', have $' + balanceInfo.availableBalance);
        }

        if (!dryRun) {
          result.steps.push({ step: 'refill', status: 'started' });
          const refillResult = await this.refillAccount(refillCalc.refillAmount);
          result.refillResult = refillResult;
          result.steps[result.steps.length - 1].status = 'completed';
        }
      }

      // Step 5: Purchase the domain
      if (!dryRun) {
        result.steps.push({ step: 'purchase', status: 'started' });
        const purchaseResult = await this.registerDomain(params);
        result.purchaseResult = purchaseResult;
        result.steps[result.steps.length - 1].status = 'completed';
        result.success = true;
        result.message = 'Domain ' + params.sld + '.' + params.tld + ' purchased successfully';

        // Get final balance
        const finalBalance = await this.getDetailedBalance();
        result.finalBalance = finalBalance.availableBalance;
      } else {
        result.success = true;
        result.message = 'Dry run completed successfully';
      }

      return result;
    } catch (error) {
      result.success = false;
      result.error = error.message;
      throw error;
    }
  }

  /**
   * Smart domain renewal with automatic balance management
   */
  async smartRenewal(sld, tld, years, cost, options = {}) {
    const { autoRefill = true, dryRun = false } = options;
    const result = { steps: [], success: false };

    try {
      const balanceInfo = await this.getDetailedBalance();
      result.currentBalance = balanceInfo.availableBalance;

      const refillCalc = this.calculateRefillNeeded(cost, balanceInfo.availableBalance);
      result.refillCalculation = refillCalc;

      if (refillCalc.needsRefill && !dryRun) {
        if (!autoRefill) {
          throw new Error('Insufficient balance for renewal');
        }
        const refillResult = await this.refillAccount(refillCalc.refillAmount);
        result.refillResult = refillResult;
      }

      if (!dryRun) {
        const renewResult = await this.renewDomain(sld, tld, years);
        result.renewResult = renewResult;
        result.success = true;
        const finalBalance = await this.getDetailedBalance();
        result.finalBalance = finalBalance.availableBalance;
      } else {
        result.success = true;
        result.message = 'Dry run completed';
      }

      return result;
    } catch (error) {
      result.success = false;
      result.error = error.message;
      throw error;
    }
  }
}

module.exports = new EnomAPI();
