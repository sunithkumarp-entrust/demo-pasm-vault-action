# Secret-Vault-Action

A secure GitHub Action for retrieving secrets from Entrust Key Control Secret Vault service for use in your GitHub CI/CD workflows.


Note: This Action is intended to use for read-only action and please refrain from modifying the vault state

## Installation

Add the Secret-Vault-Action to your GitHub Actions workflow:

```yaml
- name: Fetch Secrets
  uses: entrust/secret-vault-action@v1
  with:
    base_url: ${{ secrets.VAULT_URL }}
    auth_type: 'userpass'
    username: ${{ secrets.VAULT_USERNAME }}
    password: ${{ secrets.VAULT_PASSWORD }}
    vault_uid: ${{ secrets.VAULT_UID }}
    ca_cert: ${{ secrets.CA_CERT }}
    secrets: |
      secret.env.AWS.accessKey | AWS_ACCESS_KEY_ID
      secret.env.AWS.secretKey | AWS_SECRET_ACCESS_KEY
```

## Usage

### Input Parameters

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `base_url` | Base URL of your vault service | Yes | |
| `auth_type` | Authentication type (e.g., 'userpass') | Yes | token |
| `username` | Username for authentication | Yes, if the authtype is userpass | |
| `password` | Password for authentication | Yes, if the authtype is userpass | |
| `token` | Vault Auth Token | if auth_type is token | |
| `vault_uid` | Unique identifier for the vault | Yes, if the auth_type is userpass | |
| `ca_cert` | Base64-encoded CA certificate for self-signed certificates | No | |
| `secrets` | Multi-line list of secrets to retrieve (see format below) | Yes | |

### Secret Format

Secrets are specified in the format:

```
secret.<boxName>.<secretName> | <environment_variable_name>
```

Where:
- `boxName`: The name of the box/collection containing the secret
- `secretName`: The name of the secret to retrieve
- `destination`: The name of the environment variable to store the secret value.

### Recommended: Environment Variables Approach

The safest way to use this action is to export secrets as environment variables.

```yaml
name: Deploy Application

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      # Step 1: Fetch secrets from vault (environment variables only)
      - name: Fetch secrets from vault
        id: fetch-secrets
        uses: entrust/secret-vault-action@v1
        with:
          base_url: ${{ secrets.VAULT_URL }}
          auth_type: 'userpass'
          username: ${{ secrets.VAULT_USERNAME }}
          password: ${{ secrets.VAULT_PASSWORD }}
          vault_uid: ${{ secrets.VAULT_UID }}
          secrets: |
            secret.env.AWS.accessKey | AWS_ACCESS_KEY_ID
            secret.env.AWS.secretKey | AWS_SECRET_ACCESS_KEY
            secret.env.SSH.privateKey | SSH_KEY

      # Step 2: Create files manually when needed
      - name: Create temporary files
        run: |
          # Create directories with restricted permissions
          mkdir -p -m 700 ./ssh ./ssl
          
          # Write SSH key with proper permissions
          echo "$SSH_KEY" > ./ssh/id_rsa
          chmod 600 ./ssh/id_rsa
          
          # Write SSL certificate
          echo "$SSL_CERT" > ./ssl/certificate.pem
          chmod 644 ./ssl/certificate.pem

      # Steps 3-6: Use secrets and files as needed
      
      # Step 7: CRITICAL - Clean up sensitive files
      - name: Clean up
        if: always()  # Run even if previous steps fail
        run: |
          shred -u ./ssh/id_rsa || rm -f ./ssh/id_rsa
          rm -f ./ssl/certificate.pem
          rmdir ./ssh ./ssl
```

## Security Best Practices

1. **Environment Variables First**: Prefer using environment variables over direct file output when possible.
   
2. **Proper File Permissions**: When creating files containing sensitive data, always set restrictive permissions:
   - SSH private keys: `chmod 600`
   - SSL certificates: `chmod 644`

3. **Always Clean Up**: Always include a cleanup step that runs even if your workflow fails:
   ```yaml
   - name: Clean up
     if: always()
     run: |
       shred -u ./ssh/id_rsa || rm -f ./ssh/id_rsa
       rm -f ./ssl/certificate.pem
   ```

4. **Avoid Logging Secrets**: Never print secrets to logs. The action automatically masks secrets from logs, but be careful not to echo them in your workflow steps.

## Examples

### AWS Credentials

```yaml
- name: Fetch AWS credentials
  uses: entrust/secret-vault-action@v1
  with:
    # ...auth params...
    secrets: |
      secret.env.AWS.accessKey | AWS_ACCESS_KEY_ID
      secret.env.AWS.secretKey | AWS_SECRET_ACCESS_KEY

- name: Use AWS CLI
  run: |
    aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
    aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
    aws s3 ls
```

### API Authentication

```yaml
- name: Fetch API token
  id: fetch-secrets
  uses: entrust/secret-vault-action@v1
  with:
    # ...auth params...
    secrets: secret.env.API.token | API_TOKEN

- name: Call API
  run: |
    curl -H "Authorization: Bearer $API_TOKEN" https://api.example.com/resource
```

## Troubleshooting

- **Certificate Issues**: If you encounter SSL/TLS certificate validation errors, provide a CA certificate using the `ca_cert` input.
- **Authentication Failures**: Ensure your vault credentials are correct and have the necessary permissions.
- **Missing Secrets**: Verify that the box names and secret names match exactly as configured in your vault.

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.