/**
 * Links to /contracts/[piid].
 *
 * Task-order PIIDs are only unique within their parent IDV, so a bare PIID
 * can name several awards. Pass the parent whenever we know it; the API
 * answers an ambiguous PIID with HTTP 300 and a list of matches.
 */
export function contractHref(piid: string, parentPiid?: string | null): string {
  const path = `/contracts/${encodeURIComponent(piid)}`;
  return parentPiid ? `${path}?parent_piid=${encodeURIComponent(parentPiid)}` : path;
}

/** Link to one exact award, for when piid + parent still isn't unique. */
export function contractHrefByKey(piid: string, awardUniqueKey: string): string {
  return `/contracts/${encodeURIComponent(piid)}?award_unique_key=${encodeURIComponent(awardUniqueKey)}`;
}
