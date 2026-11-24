# Users domain

This package owns user administration and user settings commands. The
`./admin/resolve-tenant-classification` export confirms a user in the current tenant
under the caller's tenant authority. Confirmation requires a verified email address
and returns `EMAIL_NOT_PROVEN` when an account was found and the conditional update
changed no row.
