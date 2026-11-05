# Input variables of infra/main.
#
# None are needed yet: names are derived from the account id (locals.tf) and the
# region is fixed (NFR-DEP-07). Later issues add their own here, for example the
# budget alert email (#33).
#
# Never add a variable for a secret: secrets live only in SSM Parameter Store
# (NFR-SEC-02).
