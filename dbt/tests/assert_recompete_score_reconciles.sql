-- Singular test: the published recompete_score must equal the (capped) sum of
-- its exposed components. Guards against the score and its breakdown drifting
-- apart — the breakdown is what the UI shows to justify the score, so any
-- mismatch is a user-visible integrity bug. Returns offending rows (0 = pass).

select
    award_unique_key,
    recompete_score,
    rs_pop_window_pts + rs_definitive_pts + rs_above_median_pts as component_sum
from {{ ref('mart_recompete_candidates') }}
where recompete_score
    <> least(100, rs_pop_window_pts + rs_definitive_pts + rs_above_median_pts)
