# Domain users

`searchAssignableStaff(tx, { authority, search, afterId })` returns staff
options for admin claim detail using the caller's verified admin session and
restricted transaction. It searches name and email within that tenant's
`staff` role, returning up to 25 rows ordered by ID. A continuation uses the
last emitted ID. The list projects only ID, name and email. Assignment
eligibility is checked again by the existing assignment command on submission.
