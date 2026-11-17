// commit-and-tag-version custom updater for native version strings (android/app/build.gradle
// versionName, iOS project.pbxproj MARKETING_VERSION). Only lines tagged with the marker are
// touched, so unrelated version-looking strings in those files stay put.
const MARKER = 'x-release-version'
const SEMVER = /\d+\.\d+\.\d+/

module.exports.readVersion = (contents) => {
  const line = contents.split('\n').find((l) => l.includes(MARKER))
  const match = line && line.match(SEMVER)
  if (!match) throw new Error(`no ${MARKER} line with a version found`)
  return match[0]
}

module.exports.writeVersion = (contents, version) =>
  contents
    .split('\n')
    .map((l) => (l.includes(MARKER) ? l.replace(SEMVER, version) : l))
    .join('\n')
