const hasCertificateLink =
  Boolean(process.env.CSC_LINK?.trim()) ||
  Boolean(process.env.WIN_CSC_LINK?.trim())
const hasPassword =
  Boolean(process.env.CSC_KEY_PASSWORD?.trim()) ||
  Boolean(process.env.WIN_CSC_KEY_PASSWORD?.trim())
const hasCertificateName = Boolean(process.env.CSC_NAME?.trim())

if ((hasCertificateLink && hasPassword) || hasCertificateName) {
  process.exit(0)
}

process.stderr.write(
  [
    'Windows EXE signing is required for public release packaging.',
    'Provide CSC_LINK + CSC_KEY_PASSWORD, WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD, or CSC_NAME.',
  ].join('\n') + '\n',
)
process.exit(1)
