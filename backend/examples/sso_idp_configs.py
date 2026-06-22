"""
SSO IdP Configuration Examples — OrthoClinic Sprint 8

Copy-paste examples for configuring each supported Identity Provider.
Send these via POST /auth/sso/config (requires admin JWT).

All examples assume:
  BASE_URL = "https://app.orthoclinic.com.br"
  ACS URL  = "https://app.orthoclinic.com.br/auth/saml/callback"
  SLO URL  = "https://app.orthoclinic.com.br/auth/saml/logout"
  Entity ID (SP) = "https://app.orthoclinic.com.br/auth/saml/metadata"
"""

# =============================================================================
# 1. AZURE ACTIVE DIRECTORY / ENTRA ID — SAML 2.0
# =============================================================================
# Azure AD Setup:
#   1. Azure Portal → Enterprise Applications → New Application → Create your own
#   2. Set up Single sign-on → SAML
#   3. Basic SAML Configuration:
#      - Identifier (Entity ID): https://app.orthoclinic.com.br/auth/saml/metadata
#      - Reply URL (ACS URL): https://app.orthoclinic.com.br/auth/saml/callback
#      - Sign On URL: https://app.orthoclinic.com.br/auth/saml/login?org_id=<ORG_ID>
#      - Logout URL: https://app.orthoclinic.com.br/auth/saml/logout
#   4. Attributes & Claims: add groups claim → "Security groups"
#   5. Copy: App Federation Metadata URL → fetch the IdP Entity ID, SSO URL, cert

AZURE_AD_SAML = {
    "protocol":     "saml",
    "display_name": "Microsoft Entra ID",
    "active":       True,

    # From Azure AD "App Federation Metadata URL" or portal
    "saml_idp_entity_id": "https://sts.windows.net/<TENANT_ID>/",
    "saml_idp_sso_url":   "https://login.microsoftonline.com/<TENANT_ID>/saml2",
    "saml_idp_slo_url":   "https://login.microsoftonline.com/<TENANT_ID>/saml2",
    "saml_idp_cert":      "-----BEGIN CERTIFICATE-----\n<PASTE AZURE CERT HERE>\n-----END CERTIFICATE-----",

    # SP key pair — generate with: openssl req -x509 -newkey rsa:2048 -keyout sp.key -out sp.crt -days 3650 -nodes
    "saml_sp_private_key": "-----BEGIN RSA PRIVATE KEY-----\n<SP_PRIVATE_KEY>\n-----END RSA PRIVATE KEY-----",
    "saml_sp_cert":        "-----BEGIN CERTIFICATE-----\n<SP_CERT>\n-----END CERTIFICATE-----",

    "saml_sign_requests":            True,
    "saml_require_signed_assertions": True,
    "saml_nameid_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",

    # Azure AD attribute claim names
    "saml_attribute_mapping": {
        "email":          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "firstName":      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "lastName":       "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        "groups":         "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
        "organizationId": "http://schemas.microsoft.com/identity/claims/tenantid",
    },

    # JIT & MFA
    "jit_provisioning_enabled": True,
    "jit_approval_required":    False,
    "jit_default_role":         "secretary",
    "mfa_policy":               "required",
    "mfa_grace_days":           7,
}


# =============================================================================
# 2. GOOGLE WORKSPACE — SAML 2.0
# =============================================================================
# Google Admin Console Setup:
#   1. Admin Console → Apps → Web and mobile apps → Add App → Add custom SAML app
#   2. App details: give it a name
#   3. Download IdP metadata (or copy the IdP Entity ID, SSO URL, certificate)
#   4. Service Provider details:
#      - ACS URL: https://app.orthoclinic.com.br/auth/saml/callback
#      - Entity ID: https://app.orthoclinic.com.br/auth/saml/metadata
#      - Name ID format: EMAIL
#      - Name ID: Basic Information > Primary email
#   5. Attribute mapping: add Department → orthoclinic_role (optional)

GOOGLE_WORKSPACE_SAML = {
    "protocol":     "saml",
    "display_name": "Google Workspace",
    "active":       True,

    "saml_idp_entity_id": "https://accounts.google.com/o/saml2?idpid=<GOOGLE_IDP_ID>",
    "saml_idp_sso_url":   "https://accounts.google.com/o/saml2/idp?idpid=<GOOGLE_IDP_ID>",
    "saml_idp_slo_url":   None,  # Google Workspace does not support SLO
    "saml_idp_cert":      "-----BEGIN CERTIFICATE-----\n<GOOGLE_CERT>\n-----END CERTIFICATE-----",

    "saml_sp_private_key": "-----BEGIN RSA PRIVATE KEY-----\n<SP_PRIVATE_KEY>\n-----END RSA PRIVATE KEY-----",
    "saml_sp_cert":        "-----BEGIN CERTIFICATE-----\n<SP_CERT>\n-----END CERTIFICATE-----",

    "saml_sign_requests":            False,   # Google ignores signed requests
    "saml_require_signed_assertions": True,
    "saml_nameid_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",

    # Google sends: email, firstName, lastName (configured in attribute mapping in admin console)
    "saml_attribute_mapping": {
        "email":      "email",
        "firstName":  "firstName",
        "lastName":   "lastName",
        "groups":     "department",   # or custom attribute
    },

    "jit_provisioning_enabled": True,
    "jit_default_role":         "doctor",
    "mfa_policy":               "optional",
}


# =============================================================================
# 3. OKTA — SAML 2.0
# =============================================================================
# Okta Admin Console Setup:
#   1. Applications → Create App Integration → SAML 2.0
#   2. General Settings → App name: OrthoClinic
#   3. SAML Settings:
#      - Single sign-on URL: https://app.orthoclinic.com.br/auth/saml/callback
#      - Audience URI (SP Entity ID): https://app.orthoclinic.com.br/auth/saml/metadata
#      - Default RelayState: org=<ORG_ID>
#      - Application username: Email
#   4. Attribute Statements:
#      - firstName → user.firstName
#      - lastName  → user.lastName
#      - email     → user.email
#   5. Group Attribute Statements:
#      - groups → Matches regex: orthoclinic-.*
#   6. Copy IdP metadata (entityID, SSO URL, certificate)

OKTA_SAML = {
    "protocol":     "saml",
    "display_name": "Okta",
    "active":       True,

    "saml_idp_entity_id": "http://www.okta.com/<OKTA_APP_ID>",
    "saml_idp_sso_url":   "https://<OKTA_DOMAIN>.okta.com/app/<APP_ID>/sso/saml",
    "saml_idp_slo_url":   "https://<OKTA_DOMAIN>.okta.com/app/<APP_ID>/slo/saml",
    "saml_idp_cert":      "-----BEGIN CERTIFICATE-----\n<OKTA_CERT>\n-----END CERTIFICATE-----",

    "saml_sp_private_key": "-----BEGIN RSA PRIVATE KEY-----\n<SP_PRIVATE_KEY>\n-----END RSA PRIVATE KEY-----",
    "saml_sp_cert":        "-----BEGIN CERTIFICATE-----\n<SP_CERT>\n-----END CERTIFICATE-----",

    "saml_sign_requests":            True,
    "saml_require_signed_assertions": True,
    "saml_nameid_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",

    "saml_attribute_mapping": {
        "email":     "email",
        "firstName": "firstName",
        "lastName":  "lastName",
        "groups":    "groups",
    },

    "jit_provisioning_enabled": True,
    "scim_enabled": True,   # Okta supports SCIM 2.0 provisioning

    "mfa_policy":    "required",
    "mfa_grace_days": 7,
}


# =============================================================================
# 4. ONELOGIN — SAML 2.0
# =============================================================================
# OneLogin Admin:
#   1. Apps → Add App → Search "SAML Test Connector (Advanced)"
#   2. Configuration:
#      - Audience: https://app.orthoclinic.com.br/auth/saml/metadata
#      - ACS URL: https://app.orthoclinic.com.br/auth/saml/callback
#      - ACS URL Validator: .*
#      - Single Logout URL: https://app.orthoclinic.com.br/auth/saml/logout
#   3. Parameters: map Email, First Name, Last Name, Groups
#   4. SSO tab: copy Issuer URL, SAML 2.0 Endpoint, X.509 Certificate

ONELOGIN_SAML = {
    "protocol":     "saml",
    "display_name": "OneLogin",
    "active":       True,

    "saml_idp_entity_id": "https://app.onelogin.com/saml/metadata/<APP_ID>",
    "saml_idp_sso_url":   "https://<SUBDOMAIN>.onelogin.com/trust/saml2/http-post/sso/<APP_ID>",
    "saml_idp_slo_url":   "https://<SUBDOMAIN>.onelogin.com/trust/saml2/http-redirect/slo/<APP_ID>",
    "saml_idp_cert":      "-----BEGIN CERTIFICATE-----\n<ONELOGIN_CERT>\n-----END CERTIFICATE-----",

    "saml_sp_private_key": "-----BEGIN RSA PRIVATE KEY-----\n<SP_PRIVATE_KEY>\n-----END RSA PRIVATE KEY-----",
    "saml_sp_cert":        "-----BEGIN CERTIFICATE-----\n<SP_CERT>\n-----END CERTIFICATE-----",

    "saml_sign_requests":            True,
    "saml_require_signed_assertions": True,

    "saml_attribute_mapping": {
        "email":     "User.email",
        "firstName": "User.FirstName",
        "lastName":  "User.LastName",
        "groups":    "memberOf",
    },

    "jit_provisioning_enabled": True,
    "mfa_policy": "optional",
}


# =============================================================================
# 5. ADFS (Active Directory Federation Services) — SAML 2.0
# =============================================================================
# ADFS Management Console:
#   1. Add Relying Party Trust → Claims-aware → Enter data manually
#   2. Display name: OrthoClinic
#   3. Configure URL: Enable SAML 2.0 WebSSO protocol
#      URL: https://app.orthoclinic.com.br/auth/saml/callback
#   4. Configure Identifiers: add https://app.orthoclinic.com.br/auth/saml/metadata
#   5. Add Claim Issuance Policy:
#      - Send LDAP Attributes: E-Mail-Addresses → E-Mail Address
#      - Transform: E-Mail Address → Name ID (email format)
#      - Send Group Membership: orthoclinic-admin/doctor/secretary groups

ADFS_SAML = {
    "protocol":     "saml",
    "display_name": "Active Directory (ADFS)",
    "active":       True,

    "saml_idp_entity_id": "http://adfs.<COMPANY>.com/adfs/services/trust",
    "saml_idp_sso_url":   "https://adfs.<COMPANY>.com/adfs/ls/",
    "saml_idp_slo_url":   "https://adfs.<COMPANY>.com/adfs/ls/?wa=wsignout1.0",
    "saml_idp_cert":      "-----BEGIN CERTIFICATE-----\n<ADFS_TOKEN_SIGNING_CERT>\n-----END CERTIFICATE-----",

    "saml_sp_private_key": "-----BEGIN RSA PRIVATE KEY-----\n<SP_PRIVATE_KEY>\n-----END RSA PRIVATE KEY-----",
    "saml_sp_cert":        "-----BEGIN CERTIFICATE-----\n<SP_CERT>\n-----END CERTIFICATE-----",

    "saml_sign_requests":            True,
    "saml_require_signed_assertions": True,
    "saml_nameid_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",

    "saml_attribute_mapping": {
        "email":          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "firstName":      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "lastName":       "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        "groups":         "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
        "organizationId": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
    },

    "jit_provisioning_enabled": True,
    "mfa_policy": "required",
}


# =============================================================================
# 6. KEYCLOAK — OIDC (Authorization Code + PKCE)
# =============================================================================
# Keycloak Admin Console:
#   1. Realm → Clients → Create client
#   2. Client type: OpenID Connect
#   3. Client ID: orthoclinic
#   4. Client authentication: ON (confidential)
#   5. Valid redirect URIs: https://app.orthoclinic.com.br/auth/oidc/callback
#   6. Web origins: https://app.orthoclinic.com.br
#   7. Client scopes → roles → mapper: Group Membership → groups
#   8. Credentials tab → copy client secret

KEYCLOAK_OIDC = {
    "protocol":     "oidc",
    "display_name": "Keycloak SSO",
    "active":       True,

    "oidc_issuer":        "https://keycloak.<COMPANY>.com/realms/<REALM>",
    "oidc_client_id":     "orthoclinic",
    "oidc_client_secret": "<CLIENT_SECRET>",
    "oidc_scopes":        ["openid", "email", "profile", "roles"],
    "oidc_groups_claim":  "groups",

    "jit_provisioning_enabled": True,
    "mfa_policy":               "optional",
}


# =============================================================================
# 7. AUTH0 — OIDC
# =============================================================================
# Auth0 Dashboard:
#   1. Applications → Create Application → Regular Web Applications
#   2. Settings:
#      - Allowed Callback URLs: https://app.orthoclinic.com.br/auth/oidc/callback
#      - Allowed Logout URLs: https://app.orthoclinic.com.br
#   3. APIs → Enable for this application
#   4. Organizations (optional): create org, enable "Individual logins"
#   5. Rules / Actions: add custom claim for roles

AUTH0_OIDC = {
    "protocol":     "oidc",
    "display_name": "Auth0",
    "active":       True,

    "oidc_issuer":        "https://<AUTH0_DOMAIN>/",
    "oidc_client_id":     "<AUTH0_CLIENT_ID>",
    "oidc_client_secret": "<AUTH0_CLIENT_SECRET>",
    "oidc_scopes":        ["openid", "email", "profile"],
    "oidc_groups_claim":  "https://app.orthoclinic.com.br/roles",  # custom claim namespace

    "jit_provisioning_enabled": True,
    "mfa_policy":               "optional",
}


# =============================================================================
# 8. OKTA — OIDC (alternative to SAML)
# =============================================================================
# Okta Admin: Applications → Create App Integration → OIDC → Web Application
#   Redirect URIs: https://app.orthoclinic.com.br/auth/oidc/callback

OKTA_OIDC = {
    "protocol":     "oidc",
    "display_name": "Okta (OIDC)",
    "active":       True,

    "oidc_issuer":        "https://<OKTA_DOMAIN>/oauth2/default",
    "oidc_client_id":     "<OKTA_CLIENT_ID>",
    "oidc_client_secret": "<OKTA_CLIENT_SECRET>",
    "oidc_scopes":        ["openid", "email", "profile", "groups"],
    "oidc_groups_claim":  "groups",

    "jit_provisioning_enabled": True,
    "scim_enabled":             True,
    "mfa_policy":               "required",
}


# =============================================================================
# SP Key Generation (run once per environment)
# =============================================================================
SP_KEY_GENERATION_COMMANDS = """
# Generate SP private key and self-signed certificate (valid 10 years):
openssl req -x509 -newkey rsa:2048 \\
    -keyout sp_private_key.pem \\
    -out sp_certificate.pem \\
    -days 3650 \\
    -nodes \\
    -subj "/C=BR/ST=SP/L=SaoPaulo/O=OrthoClinic/CN=app.orthoclinic.com.br"

# Print in single-line format for config (optional):
awk 'NF {sub(/\\r/, ""); printf "%s\\\\n",$0;}' sp_private_key.pem
awk 'NF {sub(/\\r/, ""); printf "%s\\\\n",$0;}' sp_certificate.pem

# Send the SP certificate to your IdP admin (upload in their portal).
# Keep sp_private_key.pem secret — never commit to git.
"""


# =============================================================================
# Group → Role Mapping Reference
# =============================================================================
GROUP_ROLE_MAPPING = {
    # These group names (case-insensitive) map to OrthoClinic roles:
    # admin role
    "orthoclinic-admin": "admin",
    "admin": "admin",
    # doctor role
    "orthoclinic-doctor": "doctor",
    "doctor": "doctor",
    "medico": "doctor",
    # secretary role
    "orthoclinic-secretary": "secretary",
    "secretary": "secretary",
    "secretaria": "secretary",
    # Override per-org via saml_attribute_mapping['groups'] pointing to a different claim
}
