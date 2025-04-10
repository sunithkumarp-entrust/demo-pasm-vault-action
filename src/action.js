const core = require('@actions/core');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createAuthenticator } = require('./auth');

const checkoutSecretAPI = "/vault/1.0/CheckoutSecret/"

async function exportSecrets() {
  let tempCertPath = null;
  
  try {
    const baseUrl = core.getInput('base_url', { required: true });
    const caCert = core.getInput('ca_cert');
    const secretsInput = core.getInput('secrets', { required: true });
    const tls_verify_skip = core.getInput('tls_verify_skip');

    core.info(`Parsing secrets: ${secretsInput}`);

    let httpAgentConfig = {

    }

    if (caCert) {
      core.info('Using provided CA certificate for self-signed certificate support');
      
      // Decode base64 certificate and write to temp file
      const certBuffer = Buffer.from(caCert, 'base64');
      tempCertPath = path.join(os.tmpdir(), `ca-cert-${Date.now()}.pem`);
      fs.writeFileSync(tempCertPath, certBuffer);
      core.info(`CA certificate written to temporary file: ${tempCertPath}`);
      
      httpAgentConfig['ca'] =  fs.readFileSync(tempCertPath)
    } else {
      core.info('No CA certificate provided, using default certificate validation');
    }

    if (tls_verify_skip === true || tls_verify_skip === 'true') {
      httpsAgentConfig['rejectUnauthorized'] = false;
      core.info('TLS verification is skipped');
    }

    httpsAgent = new https.Agent(httpAgentConfig);

    // Initialize the authenticator
    const authenticator = createAuthenticator({
      baseUrl,
      httpsAgent,
      timeout: 10000
    });

    // Parse secrets from input
    for (const { secretType, boxID, secretID, destination } of parseSecrets(secretsInput)) {
      if (secretType === 'p12') {
        core.info(`Detected p12 secret type for: ${secretID}`);
        throw new Error(`Detected p12 secret type for: ${secretID}, p12 secrets are not supported yet`);
      } else {
        core.info(`Fetching secret: ${secretID} from box: ${boxID}`);
        const secretValue = await fetchSecretFromVault(boxID, secretID, authenticator, baseUrl, httpsAgent);
        core.setSecret(secretValue);
        core.exportVariable(destination, secretValue);
        core.setOutput(destination, secretValue);
      }
    }
  } catch (error) {
    core.setFailed(error.message);
    throw error; // Re-throw for testing purposes
  } finally {
    // Clean up temp file if it was created
    if (tempCertPath && fs.existsSync(tempCertPath)) {
      try {
        fs.unlinkSync(tempCertPath);
        core.info('Temporary CA certificate file cleaned up');
      } catch (err) {
        core.error(`Failed to clean up temporary certificate file: ${err.message}`);
      }
    }
  }
}

// Minimal parser for "secret.env.Box1.accessKey: AWS_ACCESS_KEY_ID"
function *parseSecrets(secretsStr) {
  const entries = secretsStr.split(';');
  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) continue;
    
    const [key, val] = trimmedEntry.split('|').map(s => s.trim());
    const parts = key.split('.');
    if (parts.length === 5 && parts[0] === 'secret') {
      const [, secretType, boxID, secretID] = parts;
      yield { secretType, boxID, secretID, destination: val };
    } else if (parts.length === 4 && parts[0] === 'secret') {
      const [, boxID, secretID] = parts;
      yield { secretType: undefined, boxID, secretID, destination: val };
    }
  }
}

async function fetchSecretFromVault(boxID, secretID, authenticator, baseUrl, httpsAgent) {
  try {
    const authHeaders = await authenticator.getAuthHeaders();
    const config = { headers: authHeaders, httpsAgent, timeout: 10000, tls };
    const response = await axios.post(
      `${baseUrl}${checkoutSecretAPI}`,
      { box_id: boxID, secret_id: secretID },
      config
    );
    if (!response.data) {
      core.error(`Empty response received from API for boxID: ${boxID}, secretID: ${secretID}`);
      throw new Error('Empty response received from API');
    }
    const secretValue = response.data.secret_data;
    if (!secretValue) {
      core.error(`Secret data not found in response: ${JSON.stringify(response.data)}`);
      throw new Error(`Secret data not found in response: ${JSON.stringify(response.data)}`);
    }
    return secretValue;
  } catch (error) {
    core.error(`Error fetching secret for boxID: ${boxID}, secretID: ${secretID} - ${error.message}`);
    throw new Error(`Failed to fetch secret: ${error.message}`);
  }
}

module.exports = { exportSecrets, fetchSecretFromVault };
