# SES domain provisioning permissions

The CRM API provisions Movira-managed sending identities in SES v2. The EC2
instance role must be able to create, read, configure, and delete identities in
the configured SES region.

For production, attach the policy in
`infra/movira-prod-app-role-ses-domain-provisioning-policy.json` to
`movira-prod-AppRole-1p5VWNOBLSVV`:

```sh
aws iam put-role-policy \
  --role-name movira-prod-AppRole-1p5VWNOBLSVV \
  --policy-name MoviraSesDomainProvisioning \
  --policy-document file://infra/movira-prod-app-role-ses-domain-provisioning-policy.json
```

Run this using an AWS administrator/deployment identity with
`iam:PutRolePolicy`. Application code cannot grant its own EC2 role new IAM
permissions.

After attaching it, retry adding the domain. If an earlier request already
created the SES identity before failing, the provisioning flow reuses it and
continues with the MAIL FROM and DNS-record steps.
