export interface GitHubReleaseSummary {
  tag_name: string
  draft?: boolean
  assets: Array<{ name: string }>
}

export function selectPreviousBrokerPackRelease(
  releases: GitHubReleaseSummary[],
  currentVersion: string,
  platform: string,
  arch: string,
): string | null {
  for (const release of releases) {
    const version = release.tag_name.replace(/^v/, '')
    if (release.draft || compareCoreVersion(version, currentVersion) >= 0) continue
    const catalog = `OpenAlice-Broker-Packs-${version}-${platform}-${arch}.json`
    if (release.assets.some((asset) => asset.name === catalog)) return release.tag_name
  }
  return null
}

function compareCoreVersion(left: string, right: string): number {
  const parse = (value: string): number[] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value)
    return match ? match.slice(1).map(Number) : null
  }
  const leftParts = parse(left)
  const rightParts = parse(right)
  if (!leftParts || !rightParts) return left.localeCompare(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!
    if (difference !== 0) return difference
  }
  return 0
}
