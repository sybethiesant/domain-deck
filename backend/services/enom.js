const https = require('https');
const querystring = require('querystring');

// Balance management constants
const CC_FEE_PERCENT = 0.05;  // eNom charges 5% for CC refills
const MIN_REFILL = 25.00;     // Minimum refill amount allowed by eNom

class EnomAPI {
  constructor() {
    // Store all credentials for dynamic switching
    this.credentials = {
      production: {
        uid: process.env.ENOM_UID,
        pw: process.env.ENOM_PW,
        baseUrl: 'reseller.enom.com'
      },
      test: {
        uid: process.env.ENOM_TEST_UID || process.env.ENOM_UID,
        pw: process.env.ENOM_TEST_PW || process.env.ENOM_PW,
        baseUrl: 'resellertest.enom.com'
      }
    };

    // Initialize with env var setting
    this.setMode(process.env.ENOM_ENV || 'test');
  }

  /**
   * Switch between test and production mode
   * @param {string} mode - 'test' or 'production'
   */
  setMode(mode) {
    const validMode = mode === 'production' ? 'production' : 'test';
    this.env = validMode;

    const creds = this.credentials[validMode];
    this.uid = creds.uid;
    this.pw = creds.pw;
    this.baseUrl = creds.baseUrl;

    // Validate credentials are configured
    if (!this.uid || !this.pw) {
      console.error(`[eNom] WARNING: ${validMode} credentials not configured. API calls will fail.`);
    }

    console.log(`[eNom] Mode set to ${validMode} -> ${this.baseUrl}`);
    return { mode: validMode, endpoint: this.baseUrl };
  }

  /**
   * Get current mode
   * @returns {object} Current mode info
   */
  getMode() {
    return {
      mode: this.env,
      endpoint: this.baseUrl,
      hasCredentials: !!(this.uid && this.pw)
    };
  }

  /**
   * Validate domain name parts to prevent injection attacks
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @throws {Error} If validation fails
   */
  validateDomainParts(sld, tld) {
    // SLD must be alphanumeric with hyphens, 1-63 chars
    const sldRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    // TLD must be alphanumeric, 2-63 chars
    const tldRegex = /^[a-zA-Z]{2,63}$/;

    if (!sld || typeof sld !== 'string') {
      throw new Error('Invalid SLD: must be a non-empty string');
    }
    if (!tld || typeof tld !== 'string') {
      throw new Error('Invalid TLD: must be a non-empty string');
    }
    if (!sldRegex.test(sld)) {
      throw new Error('Invalid SLD: must be alphanumeric with optional hyphens, 1-63 characters');
    }
    if (!tldRegex.test(tld)) {
      throw new Error('Invalid TLD: must be alphabetic, 2-63 characters');
    }
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
   * @param {object} options - Request options
   * @param {string} options.mode - Override mode for this request ('test' or 'production')
   * @returns {Promise<object>} - Parsed response
   */
  async request(command, params = {}, options = {}) {
    // Allow per-request mode override for managing domains registered in different modes
    const requestMode = options.mode || this.env;
    const creds = this.credentials[requestMode];
    const useUid = creds?.uid || this.uid;
    const usePw = creds?.pw || this.pw;
    const useBaseUrl = creds?.baseUrl || this.baseUrl;

    if (options.mode && options.mode !== this.env) {
      console.log(`[eNom API] Using ${requestMode} mode for this request (global: ${this.env})`);
    }
    console.log(`[eNom API] Command: ${command}, Params:`, JSON.stringify(params));

    const queryParams = {
      command,
      uid: useUid,
      pw: usePw,
      // Use text format - JSON is broken on eNom's side
      ...params
    };

    const queryString = querystring.stringify(queryParams);
    const url = `/interface.asp?${queryString}`;

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: useBaseUrl,
        port: 443,
        path: url,
        method: 'GET',
        headers: {
          'User-Agent': 'WorxTech/1.0'
        }
      };

      const req = https.request(reqOptions, (res) => {
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
      this.validateDomainParts(sld, tld);
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
      privacy = false,
      extendedAttributes = {}  // ccTLD-specific attributes (e.g., .in requires Aadhaar/PAN)
    } = params;

    // Validate domain parts
    this.validateDomainParts(sld, tld);

    const requestParams = {
      sld,
      tld,
      NumYears: years,
      UseDNS: nameservers.length > 0 ? 'default' : '',
      // Disable auto-renew on eNom side - our system handles renewals
      RenewName: '0'
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

    // Add extended attributes for ccTLDs (e.g., .in requires Aadhaar/PAN)
    // extendedAttributes should be an object like: { in_aadharnumber: '123456789012', in_panumber: 'ABCDE1234F' }
    if (extendedAttributes && typeof extendedAttributes === 'object') {
      Object.entries(extendedAttributes).forEach(([key, value]) => {
        if (value) {
          requestParams[key] = value;
        }
      });
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
      // Check if domain was actually registered despite the error
      // (eNom sometimes returns errors for successful registrations)
      try {
        const info = await this.getDomainInfo(sld, tld);
        if (info && info.status === 'Registered') {
          console.log(`Domain ${sld}.${tld} registered successfully despite error: ${error.message}`);
          return {
            success: true,
            orderId: null,
            domainName: `${sld}.${tld}`,
            status: 'registered',
            expirationDate: info.expirationDate,
            note: 'Registered (verified after initial error)'
          };
        }
      } catch (verifyError) {
        // Domain not found, original error stands
      }

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
  async renewDomain(sld, tld, years = 1, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('Extend', {
        sld,
        tld,
        NumYears: years
      }, { mode: options.mode });

      console.log(`[eNom] Extend response for ${sld}.${tld}:`, JSON.stringify(response));

      // eNom may return expiration in different fields
      let newExpiration = response.ExpirationDate || response['expiration-date'] || response.DomainExpDate || response.RegistryExpDate;

      // Parse date if it includes time (e.g., "2028-01-15 01:18:01.107" -> "2028-01-15")
      if (newExpiration && newExpiration.includes(' ')) {
        newExpiration = newExpiration.split(' ')[0];
      }

      console.log(`[eNom] Renewal new expiration for ${sld}.${tld}: ${newExpiration}`);

      return {
        success: true,
        orderId: response.OrderID,
        domainName: `${sld}.${tld}`,
        newExpiration
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
  async updateNameservers(sld, tld, nameservers, options = {}) {
    this.validateDomainParts(sld, tld);
    const params = { sld, tld };

    nameservers.forEach((ns, index) => {
      params[`NS${index + 1}`] = ns;
    });

    try {
      const response = await this.request('ModifyNS', params, { mode: options.mode });

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
  async getNameservers(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('GetDNS', { sld, tld }, { mode: options.mode });

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
  async getDomainInfo(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('GetDomainInfo', { sld, tld }, { mode: options.mode });

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
  async getFullDomainData(sld, tld, options = {}) {
    this.validateDomainParts(sld, tld);
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

    const reqOpts = { mode: options.mode };

    // Fetch all data in parallel for speed
    const [infoResult, nsResult, lockResult, renewResult, privacyResult] = await Promise.allSettled([
      this.request('GetDomainInfo', { sld, tld }, reqOpts),
      this.request('GetDNS', { sld, tld }, reqOpts),
      this.request('GetRegLock', { sld, tld }, reqOpts),
      this.request('GetRenew', { sld, tld }, reqOpts),
      this.request('GetWPPSInfo', { sld, tld }, reqOpts)
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
      const wpps = privacyResult.value;
      result.privacyEnabled = wpps.WPPSEnabled === '1';
      result.privacyExpDate = wpps.WPPSExpDate || wpps['wpps-exp-date'] || null;
      result.privacyPurchased = !!(result.privacyExpDate && new Date(result.privacyExpDate) > new Date());
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
  async setWhoisPrivacy(sld, tld, enable, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const command = enable ? 'EnableServices' : 'DisableServices';
      const response = await this.request(command, {
        sld,
        tld,
        Service: 'WPPS'
      }, { mode: options.mode });

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
   * Purchase WHOIS privacy (ID Protect) for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {number} years - Number of years (default 1)
   * @returns {Promise<object>} - Result
   */
  async purchasePrivacy(sld, tld, years = 1, options = {}) {
    try {
      this.validateDomainParts(sld, tld);

      // Use PurchaseServices to buy ID Protect (WPPS)
      const response = await this.request('PurchaseServices', {
        sld,
        tld,
        Service: 'WPPS',
        NumYears: years
      }, { mode: options.mode });

      console.log(`[eNom] Privacy purchased for ${sld}.${tld}:`, response);

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        years,
        privacyEnabled: true
      };
    } catch (error) {
      console.error(`eNom purchase privacy error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get WHOIS privacy service status
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Privacy status including expiration
   */
  async getPrivacyStatus(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('GetWPPSInfo', { sld, tld }, { mode: options.mode });

      const expDate = response.WPPSExpDate || response['wpps-exp-date'] || null;
      const isEnabled = response.WPPSEnabled === '1';
      const isPurchased = !!(expDate && new Date(expDate) > new Date());

      return {
        domainName: `${sld}.${tld}`,
        enabled: isEnabled,
        purchased: isPurchased,
        expirationDate: expDate,
        // If purchased but not enabled, can enable for free
        // If not purchased, enabling will incur a charge
        canEnableFree: isPurchased && !isEnabled,
        willCharge: !isPurchased
      };
    } catch (error) {
      console.error(`eNom get privacy status error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Get WHOIS contact information
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Contact information
   */
  async getWhoisContacts(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('GetContacts', { sld, tld }, { mode: options.mode });

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
      const count = parseInt(response.DomainCount || response.count || 0);

      // Parse numbered key-value pairs (sld1, tld1, sld2, tld2, etc.)
      for (let i = 1; i <= count; i++) {
        const sld = response[`sld${i}`];
        const tld = response[`tld${i}`];

        if (sld && tld) {
          domains.push({
            domainNameId: response[`DomainNameID${i}`],
            sld: sld,
            tld: tld,
            domain: `${sld}.${tld}`,
            expirationDate: response[`expiration-date${i}`],
            autoRenew: response[`auto-renew${i}`] === 'Yes',
            privacyEnabled: response[`wppsstatus${i}`] !== 'disabled' && response[`wppsstatus${i}`] !== 'n/a'
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

      // eNom returns balance with commas (e.g., "50,000.00") - remove them before parsing
      const balanceStr = (response.Balance || '0').replace(/,/g, '');

      return {
        balance: parseFloat(balanceStr),
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
  async setDomainLock(sld, tld, lock, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      // eNom uses SetRegLock for both lock and unlock
      // UnlockRegistrar=0 means lock, UnlockRegistrar=1 means unlock
      console.log(`[eNom] Setting lock for ${sld}.${tld} to ${lock ? 'LOCKED' : 'UNLOCKED'}`);
      const response = await this.request('SetRegLock', {
        sld,
        tld,
        UnlockRegistrar: lock ? '0' : '1'
      }, { mode: options.mode });
      console.log(`[eNom] Lock response:`, response);

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
  async getAuthCode(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      // Try to unlock the domain (required by eNom to retrieve auth code)
      // If already unlocked, this may fail - that's OK, continue anyway
      try {
        await this.setDomainLock(sld, tld, false, options);
      } catch (unlockError) {
        console.log(`[eNom] Domain ${sld}.${tld} unlock skipped (may already be unlocked):`, unlockError.message);
      }

      const response = await this.request('SynchAuthInfo', {
        sld,
        tld,
        EmailEPP: 'False',
        RunSynchAutoInfo: 'True'
      }, { mode: options.mode });

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
  async updateContacts(sld, tld, contacts, options = {}) {
    this.validateDomainParts(sld, tld);
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
      const response = await this.request('Contacts', requestParams, { mode: options.mode });

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
  async setAutoRenew(sld, tld, autoRenew, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('SetRenew', {
        sld,
        tld,
        RenewFlag: autoRenew ? '1' : '0'
      }, { mode: options.mode });

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
      organization: getField('OrganizationName') || getField('Organization') || getField('OrgName'),
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

      // eNom returns balance with commas (e.g., "50,000.00") - remove them before parsing
      const balanceStr = (response.AvailableBalance || response.Balance || '0').replace(/,/g, '');
      const balance = parseFloat(balanceStr);

      return {
        availableBalance: balance,
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
   * Refill account balance using securely stored credit card
   * @param {number} amount - Amount to refill in USD (minimum $25)
   * @returns {Promise<object>} - Refill result
   */
  async refillAccount(amount) {
    if (amount < MIN_REFILL) {
      throw new Error('Minimum refill amount is $' + MIN_REFILL);
    }

    // Load encrypted card details
    const { loadCredentials, credentialsExist } = require('./crypto');
    const encryptionKey = process.env.ENOM_CC_KEY;

    if (!encryptionKey) {
      throw new Error('ENOM_CC_KEY not configured. Cannot process refill.');
    }

    if (!credentialsExist()) {
      throw new Error(
        'Credit card not configured. Run: node backend/scripts/store-card.js'
      );
    }

    let cardDetails;
    try {
      cardDetails = loadCredentials(encryptionKey);
    } catch (error) {
      throw new Error('Failed to decrypt card details: ' + error.message);
    }

    if (!cardDetails || !cardDetails.CCNumber) {
      throw new Error('Invalid card details stored. Re-run store-card.js');
    }

    try {
      // Call eNom with full card details (HTTPS required - already using HTTPS)
      const response = await this.request('RefillAccount', {
        CCAmount: amount.toFixed(2),
        debit: 'true',
        CCType: cardDetails.CCType,
        CCName: cardDetails.CCName,
        CCNumber: cardDetails.CCNumber,
        CCMonth: cardDetails.CCMonth,
        CCYear: cardDetails.CCYear,
        cvv2: cardDetails.cvv2,
        ccaddress: cardDetails.ccaddress,
        CCCity: cardDetails.CCCity,
        CCStateProvince: cardDetails.CCStateProvince,
        cczip: cardDetails.cczip,
        CCCountry: cardDetails.CCCountry,
        CCPhone: cardDetails.CCPhone
      });

      // Check for errors
      if (parseInt(response.ErrCount) > 0) {
        const errMsg = response.Err1 || response.Error || 'Refill failed';
        throw new Error(errMsg);
      }

      const feeAmount = amount * CC_FEE_PERCENT;
      const netAmount = amount - feeAmount;

      // Log success (never log card details)
      console.log(`eNom refill: Charged $${amount} (CC fee $${feeAmount.toFixed(2)})`);

      return {
        success: true,
        requestedAmount: amount,
        feePercent: CC_FEE_PERCENT * 100,
        feeAmount: parseFloat(feeAmount.toFixed(2)),
        netAmount: parseFloat(netAmount.toFixed(2)),
        transactionId: response.TransactionID || response.OrderID,
        message: 'Account refilled successfully'
      };
    } catch (error) {
      // Never log card details in errors
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
          throw new Error(`Insufficient balance. Need $${domainCost}, have $${balanceInfo.availableBalance}`);
        }

        if (!dryRun) {
          result.steps.push({ step: 'refill', status: 'started' });
          const refillResult = await this.refillAccount(refillCalc.refillAmount);
          result.refillResult = refillResult;
          result.steps[result.steps.length - 1].status = 'completed';

          // Verify balance actually increased
          const verifyBalance = await this.getDetailedBalance();
          result.balanceAfterRefill = verifyBalance.availableBalance;

          if (verifyBalance.availableBalance < domainCost) {
            throw new Error(
              `Refill processed but balance insufficient: $${verifyBalance.availableBalance}. ` +
              `Required: $${domainCost}. Please check your card or try again.`
            );
          }
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
    const { autoRefill = true, dryRun = false, mode } = options;
    const result = { steps: [], success: false };

    try {
      const balanceInfo = await this.getDetailedBalance();
      result.currentBalance = balanceInfo.availableBalance;

      const refillCalc = this.calculateRefillNeeded(cost, balanceInfo.availableBalance);
      result.refillCalculation = refillCalc;

      if (refillCalc.needsRefill && !dryRun) {
        if (!autoRefill) {
          throw new Error(`Insufficient balance for renewal. Need $${cost}, have $${balanceInfo.availableBalance}`);
        }
        const refillResult = await this.refillAccount(refillCalc.refillAmount);
        result.refillResult = refillResult;

        // Verify balance increased
        const verifyBalance = await this.getDetailedBalance();
        if (verifyBalance.availableBalance < cost) {
          throw new Error(`Refill processed but balance insufficient for renewal`);
        }
      }

      if (!dryRun) {
        const renewResult = await this.renewDomain(sld, tld, years, { mode });
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

  /**
   * Smart domain transfer with automatic balance management
   */
  async smartTransfer(params, options = {}) {
    const { autoRefill = true, dryRun = false } = options;
    const result = { steps: [], success: false };

    try {
      // Step 1: Get current balance
      const balanceInfo = await this.getDetailedBalance();
      result.currentBalance = balanceInfo.availableBalance;

      // Step 2: Get transfer cost
      const transferCost = params.cost || params.price || 0;
      if (!transferCost) {
        throw new Error('Transfer cost must be provided in params.cost or params.price');
      }
      result.transferCost = transferCost;

      // Step 3: Calculate refill needed
      const refillCalc = this.calculateRefillNeeded(transferCost, balanceInfo.availableBalance);
      result.refillCalculation = refillCalc;

      // Step 4: Refill if needed
      if (refillCalc.needsRefill) {
        if (!autoRefill) {
          throw new Error(`Insufficient balance for transfer. Need $${transferCost}, have $${balanceInfo.availableBalance}`);
        }

        if (!dryRun) {
          result.steps.push({ step: 'refill', status: 'started' });
          const refillResult = await this.refillAccount(refillCalc.refillAmount);
          result.refillResult = refillResult;
          result.steps[result.steps.length - 1].status = 'completed';

          // Verify balance increased
          const verifyBalance = await this.getDetailedBalance();
          if (verifyBalance.availableBalance < transferCost) {
            throw new Error(`Refill processed but balance insufficient for transfer`);
          }
        }
      }

      // Step 5: Initiate the transfer
      if (!dryRun) {
        result.steps.push({ step: 'transfer', status: 'started' });
        const transferResult = await this.initiateTransfer(params);
        result.transferResult = transferResult;
        result.steps[result.steps.length - 1].status = 'completed';
        result.success = transferResult.success;
        result.transferOrderId = transferResult.transferOrderId;

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
   * Get extended attributes required for a TLD
   * Returns user-friendly attribute definitions for ccTLDs
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Extended attributes info
   */
  async getExtendedAttributes(tld) {
    // Hardcoded friendly definitions for common ccTLDs
    // This avoids complex XML parsing and gives us control over UX
    const ccTldRequirements = {
      us: {
        hasRequirements: true,
        attributes: [
          {
            name: 'us_nexus',
            required: true,
            description: 'How are you connected to the United States?',
            options: [
              { value: 'C11', title: 'US Citizen' },
              { value: 'C12', title: 'Permanent Resident' },
              { value: 'C21', title: 'US Business or Organization' },
              { value: 'C31', title: 'Foreign Business with US Activities' },
              { value: 'C32', title: 'Foreign Organization with US Office' }
            ]
          },
          {
            name: 'us_purpose',
            required: true,
            description: 'What will this domain be used for?',
            options: [
              { value: 'P1', title: 'Business (For Profit)' },
              { value: 'P2', title: 'Non-Profit Organization' },
              { value: 'P3', title: 'Personal Use' },
              { value: 'P4', title: 'Educational' },
              { value: 'P5', title: 'Government' }
            ]
          }
        ]
      },
      in: {
        hasRequirements: true,
        attributes: [
          {
            name: 'in_aadharnumber',
            required: false,
            description: 'Your 12-digit Indian Aadhaar identification number (optional)',
            options: []
          },
          {
            name: 'in_panumber',
            required: false,
            description: 'Your 10-character Indian PAN card number (optional)',
            options: []
          }
        ]
      },
      uk: {
        hasRequirements: true,
        attributes: [
          {
            name: 'uk_legal_type',
            required: true,
            description: 'What type of registrant are you?',
            options: [
              { value: 'IND', title: 'Individual (UK Resident)' },
              { value: 'FIND', title: 'Individual (Non-UK Resident)' },
              { value: 'LTD', title: 'UK Limited Company' },
              { value: 'PLC', title: 'UK Public Limited Company' },
              { value: 'PTNR', title: 'UK Partnership' },
              { value: 'STRA', title: 'UK Sole Trader' },
              { value: 'LLP', title: 'UK Limited Liability Partnership' },
              { value: 'RCHAR', title: 'UK Registered Charity' },
              { value: 'FCORP', title: 'Foreign Company' },
              { value: 'OTHER', title: 'Other UK Entity' },
              { value: 'FOTHER', title: 'Other Non-UK Entity' }
            ]
          }
        ]
      },
      ca: {
        hasRequirements: true,
        attributes: [
          {
            name: 'ca_legal_type',
            required: true,
            description: 'What type of Canadian entity are you?',
            options: [
              { value: 'CCT', title: 'Canadian Citizen' },
              { value: 'RES', title: 'Permanent Resident of Canada' },
              { value: 'CCO', title: 'Canadian Corporation' },
              { value: 'GOV', title: 'Government Entity' },
              { value: 'EDU', title: 'Canadian Educational Institution' },
              { value: 'ASS', title: 'Canadian Unincorporated Association' },
              { value: 'HOP', title: 'Canadian Hospital' },
              { value: 'PRT', title: 'Partnership in Canada' },
              { value: 'TDM', title: 'Trademark Owner (Canada)' },
              { value: 'TRD', title: 'Trade Union in Canada' },
              { value: 'PLT', title: 'Canadian Political Party' },
              { value: 'LAM', title: 'Canadian Library, Archive, or Museum' },
              { value: 'INB', title: 'Indian Band in Canada' },
              { value: 'ABO', title: 'Aboriginal Peoples in Canada' },
              { value: 'LGR', title: 'Legal Representative' },
              { value: 'OMK', title: 'Official Mark Registrant' },
              { value: 'MAJ', title: 'Her Majesty the Queen' }
            ]
          }
        ]
      },
      eu: {
        hasRequirements: true,
        attributes: [
          {
            name: 'eu_country',
            required: true,
            description: 'Your country of residence within the European Union',
            options: [
              { value: 'AT', title: 'Austria' },
              { value: 'BE', title: 'Belgium' },
              { value: 'BG', title: 'Bulgaria' },
              { value: 'HR', title: 'Croatia' },
              { value: 'CY', title: 'Cyprus' },
              { value: 'CZ', title: 'Czech Republic' },
              { value: 'DK', title: 'Denmark' },
              { value: 'EE', title: 'Estonia' },
              { value: 'FI', title: 'Finland' },
              { value: 'FR', title: 'France' },
              { value: 'DE', title: 'Germany' },
              { value: 'GR', title: 'Greece' },
              { value: 'HU', title: 'Hungary' },
              { value: 'IE', title: 'Ireland' },
              { value: 'IT', title: 'Italy' },
              { value: 'LV', title: 'Latvia' },
              { value: 'LT', title: 'Lithuania' },
              { value: 'LU', title: 'Luxembourg' },
              { value: 'MT', title: 'Malta' },
              { value: 'NL', title: 'Netherlands' },
              { value: 'PL', title: 'Poland' },
              { value: 'PT', title: 'Portugal' },
              { value: 'RO', title: 'Romania' },
              { value: 'SK', title: 'Slovakia' },
              { value: 'SI', title: 'Slovenia' },
              { value: 'ES', title: 'Spain' },
              { value: 'SE', title: 'Sweden' }
            ]
          }
        ]
      },
      au: {
        hasRequirements: true,
        attributes: [
          {
            name: 'au_registrant_id_type',
            required: true,
            description: 'What type of Australian ID do you have?',
            options: [
              { value: 'ABN', title: 'Australian Business Number (ABN)' },
              { value: 'ACN', title: 'Australian Company Number (ACN)' },
              { value: 'TM', title: 'Trademark Number' }
            ]
          },
          {
            name: 'au_registrant_id',
            required: true,
            description: 'Enter your ABN, ACN, or Trademark number',
            options: []
          }
        ]
      }
    };

    const tldLower = tld.toLowerCase();

    // Return hardcoded requirements if available
    if (ccTldRequirements[tldLower]) {
      return {
        tld: tldLower,
        ...ccTldRequirements[tldLower],
        requiredCount: ccTldRequirements[tldLower].attributes.filter(a => a.required).length
      };
    }

    // For TLDs without special requirements, return empty
    // Common TLDs that don't need special attributes
    const noRequirementsTlds = ['com', 'net', 'org', 'info', 'biz', 'co', 'io', 'me', 'tv', 'cc', 'ws'];
    if (noRequirementsTlds.includes(tldLower)) {
      return { tld: tldLower, hasRequirements: false, attributes: [], requiredCount: 0 };
    }

    // For unknown TLDs, try to fetch from eNom (fallback)
    const params = {
      tld: tld.toLowerCase(),
      responsetype: 'xml'
    };

    return new Promise((resolve, reject) => {
      const queryParams = {
        command: 'GetExtAttributes',
        uid: this.uid,
        pw: this.pw,
        ...params
      };

      const queryString = querystring.stringify(queryParams);
      const url = `/interface.asp?${queryString}`;

      const req = https.request({
        hostname: this.baseUrl,
        port: 443,
        path: url,
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            // Parse XML response to extract attributes
            const attributes = [];
            const seenNames = new Set();

            // Get the Attributes section
            const attrsSection = data.match(/<Attributes>([\s\S]*)<\/Attributes>/);
            if (!attrsSection) {
              resolve({ tld, hasRequirements: false, attributes: [], requiredCount: 0 });
              return;
            }

            const content = attrsSection[1];

            // Find all top-level attribute start positions
            // Top-level attrs have the pattern: <Attribute>\s*<ID>
            const startPattern = /<Attribute>\s*<ID>(\d+)<\/ID>/g;
            const attrStarts = [];
            let startMatch;
            while ((startMatch = startPattern.exec(content)) !== null) {
              attrStarts.push({ pos: startMatch.index, id: startMatch[1] });
            }

            // For each start, find the matching </Attribute> by counting open/close tags
            for (let i = 0; i < attrStarts.length; i++) {
              const startPos = attrStarts[i].pos;
              const endPos = i + 1 < attrStarts.length ? attrStarts[i + 1].pos : content.length;

              // Get the block for this attribute (up to next attribute or end)
              let block = content.substring(startPos, endPos);

              // Find proper closing tag by counting
              let depth = 0;
              let closePos = -1;
              let searchPos = 0;
              while (searchPos < block.length) {
                const openTag = block.indexOf('<Attribute>', searchPos);
                const closeTag = block.indexOf('</Attribute>', searchPos);

                if (openTag !== -1 && (closeTag === -1 || openTag < closeTag)) {
                  depth++;
                  searchPos = openTag + 11;
                } else if (closeTag !== -1) {
                  depth--;
                  if (depth === 0) {
                    closePos = closeTag + 12;
                    break;
                  }
                  searchPos = closeTag + 12;
                } else {
                  break;
                }
              }

              if (closePos > 0) {
                block = block.substring(0, closePos);
              }

              // Extract fields
              const nameMatch = block.match(/<Name>([^<]+)<\/Name>/);
              const requiredMatch = block.match(/<Required>(\d)<\/Required>/);
              const descMatch = block.match(/<Description>([^<]*)<\/Description>/);
              const isChildMatch = block.match(/<IsChild>(\d)<\/IsChild>/);

              if (!nameMatch) continue;

              const name = nameMatch[1];
              const required = requiredMatch ? requiredMatch[1] : '0';
              const description = descMatch ? descMatch[1] : '';
              const isChild = isChildMatch ? isChildMatch[1] : '0';

              // Skip child attributes and duplicates
              if (isChild === '1' || seenNames.has(name)) continue;
              seenNames.add(name);

              const attr = {
                id: attrStarts[i].id,
                name,
                required: required === '1',
                description,
                options: []
              };

              // Parse options
              const optionsMatch = block.match(/<Options>([\s\S]*)<\/Options>/);
              if (optionsMatch) {
                // Extract Value/Title pairs from Option blocks
                const optPattern = /<Option>[\s\S]*?<Value>([^<]+)<\/Value>[\s\S]*?<Title>([^<]+)<\/Title>/g;
                let optMatch;
                while ((optMatch = optPattern.exec(optionsMatch[1])) !== null) {
                  attr.options.push({ value: optMatch[1], title: optMatch[2] });
                }

                // Sort country lists to put United States first
                if (name.includes('cc') || name.includes('country')) {
                  attr.options.sort((a, b) => {
                    if (a.value === 'US') return -1;
                    if (b.value === 'US') return 1;
                    return a.title.localeCompare(b.title);
                  });
                }
              }

              attributes.push(attr);
            }

            resolve({
              tld,
              hasRequirements: attributes.some(a => a.required),
              attributes,
              requiredCount: attributes.filter(a => a.required).length
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  /**
   * Helper to extract value from XML tag
   */
  extractXmlValue(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].trim() : '';
  }

  // ============================================
  // EMAIL FORWARDING FUNCTIONS
  // ============================================

  /**
   * Get email forwarding addresses for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Email forwards
   */
  async getEmailForwarding(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('GetEmailForward', { sld, tld }, { mode: options.mode });

      const forwards = [];
      const count = parseInt(response.ForwardCount || response.forwardcount || 0);

      for (let i = 1; i <= count; i++) {
        const emailUser = response[`forward${i}email`] || response[`Forward${i}Email`];
        const forwardTo = response[`forward${i}value`] || response[`Forward${i}Value`];

        if (emailUser && forwardTo) {
          forwards.push({
            id: i,
            emailUser: emailUser,
            emailAddress: `${emailUser}@${sld}.${tld}`,
            forwardTo: forwardTo
          });
        }
      }

      return {
        domainName: `${sld}.${tld}`,
        forwards,
        count: forwards.length
      };
    } catch (error) {
      // If no forwarding is set up, eNom may return an error
      if (error.message.includes('No Email Forwards')) {
        return { domainName: `${sld}.${tld}`, forwards: [], count: 0 };
      }
      console.error(`eNom get email forwarding error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Set email forwarding for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {string} emailUser - Local part of email (before @)
   * @param {string} forwardTo - Email address to forward to
   * @returns {Promise<object>} - Result
   */
  async setEmailForward(sld, tld, emailUser, forwardTo, options = {}) {
    try {
      this.validateDomainParts(sld, tld);

      // Validate email user (local part)
      if (!emailUser || !/^[a-zA-Z0-9._%+-]+$/.test(emailUser)) {
        throw new Error('Invalid email username format');
      }

      // Validate forward-to address
      if (!forwardTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forwardTo)) {
        throw new Error('Invalid forward-to email address');
      }

      const response = await this.request('SetEmailForward', {
        sld,
        tld,
        EmailUser: emailUser.toLowerCase(),
        ForwardEmail: forwardTo.toLowerCase()
      }, { mode: options.mode });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        emailAddress: `${emailUser.toLowerCase()}@${sld}.${tld}`,
        forwardTo: forwardTo.toLowerCase()
      };
    } catch (error) {
      console.error(`eNom set email forward error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete email forwarding
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {string} emailUser - Local part of email to delete
   * @returns {Promise<object>} - Result
   */
  async deleteEmailForward(sld, tld, emailUser, options = {}) {
    try {
      this.validateDomainParts(sld, tld);

      const response = await this.request('DeleteEmailForward', {
        sld,
        tld,
        EmailUser: emailUser.toLowerCase()
      }, { mode: options.mode });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        deleted: `${emailUser.toLowerCase()}@${sld}.${tld}`
      };
    } catch (error) {
      console.error(`eNom delete email forward error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  // ============================================
  // URL FORWARDING FUNCTIONS
  // ============================================

  /**
   * Get URL forwarding settings for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - URL forwarding settings
   */
  async getUrlForwarding(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);
      const response = await this.request('GetForwarding', { sld, tld }, { mode: options.mode });

      return {
        domainName: `${sld}.${tld}`,
        enabled: response.ForwardingEnabled === '1' || response.forwarding === 'enabled',
        forwardUrl: response.ForwardURL || response.forwardurl || null,
        forwardType: response.ForwardType || response.forwardtype || 'temporary', // 'permanent' (301) or 'temporary' (302)
        cloak: response.CloakTitle ? true : false,
        cloakTitle: response.CloakTitle || null,
        cloakDescription: response.CloakDescription || null,
        cloakKeywords: response.CloakKeywords || null,
        // Subdomain forwarding
        subdomainForwarding: response.SubForwarding || null,
        subdomainUrl: response.SubForwardURL || null
      };
    } catch (error) {
      // If no forwarding is set, eNom may return an error
      if (error.message.includes('No forwarding') || error.message.includes('not enabled')) {
        return {
          domainName: `${sld}.${tld}`,
          enabled: false,
          forwardUrl: null,
          forwardType: null,
          cloak: false
        };
      }
      console.error(`eNom get URL forwarding error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Set URL forwarding for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @param {object} params - Forwarding parameters
   * @returns {Promise<object>} - Result
   */
  async setUrlForwarding(sld, tld, params, options = {}) {
    const {
      forwardUrl,
      forwardType = 'temporary', // 'permanent' (301) or 'temporary' (302)
      cloak = false,
      cloakTitle = '',
      cloakDescription = '',
      cloakKeywords = ''
    } = params;

    try {
      this.validateDomainParts(sld, tld);

      // Validate URL
      if (!forwardUrl) {
        throw new Error('Forward URL is required');
      }

      // Ensure URL has protocol
      let normalizedUrl = forwardUrl;
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      const requestParams = {
        sld,
        tld,
        ForwardURL: normalizedUrl,
        ForwardType: forwardType === 'permanent' ? '301' : '302'
      };

      // Add cloaking options if enabled
      if (cloak) {
        requestParams.CloakTitle = cloakTitle || sld;
        requestParams.CloakDescription = cloakDescription || '';
        requestParams.CloakKeywords = cloakKeywords || '';
      }

      const response = await this.request('SetForwarding', requestParams, { mode: options.mode });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        forwardUrl: normalizedUrl,
        forwardType,
        cloak
      };
    } catch (error) {
      console.error(`eNom set URL forwarding error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }

  /**
   * Disable URL forwarding for a domain
   * @param {string} sld - Second level domain
   * @param {string} tld - Top level domain
   * @returns {Promise<object>} - Result
   */
  async disableUrlForwarding(sld, tld, options = {}) {
    try {
      this.validateDomainParts(sld, tld);

      const response = await this.request('DeleteForwarding', { sld, tld }, { mode: options.mode });

      return {
        success: true,
        domainName: `${sld}.${tld}`,
        message: 'URL forwarding disabled'
      };
    } catch (error) {
      console.error(`eNom disable URL forwarding error for ${sld}.${tld}:`, error.message);
      throw error;
    }
  }
}

module.exports = new EnomAPI();
