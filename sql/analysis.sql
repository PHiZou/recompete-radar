-- ============================================================================
--  SUNLIGHT — ANALYSIS QUERIES
--  Questions this dataset can actually answer, with the results I got on
--  2026-08-07. Numbers in comments are what these returned; re-run to confirm.
--
--  HOW TO RUN
--  ----------
--  Paste into the Neon SQL Editor, or:
--      .venv/bin/python sql/query.py "$(pbpaste)"
--  Note: `query.py --lesson N` only reads learn_sql.sql, not this file.
--
--  WHAT THE DATA IS (read this first — it bounds every answer below)
--  ----------------
--  raw.award_transactions is NOT transaction-level despite the name. It is
--  USASpending's Contracts_PrimeAwardSummaries export: one row per award,
--  `modification_number` blank on every row and mart_awards `action_count` = 1
--  everywhere. There is no modification history.
--
--  `fiscal_year = 2024` on every row is a PARTITION LABEL, not a filter. The
--  download endpoint returns the agency's full all-time set regardless of the
--  FY window, and refresh.sh prunes to one partition on purpose so dollars
--  don't inflate 6x. Coverage is effectively all-time (pop_start 1996–2026).
--
--  SCOPE (expanded 2026-08-07 — 38,115 -> 57,566 rows):
--    5 agencies: HHS 21,652 / VA 13,274 / DHS 12,325 / Commerce 8,115 / SSA 2,200
--    3 NAICS:    541511, 541512 (software dev) + 518210 (data processing)
--  Commerce is pulled whole because the API filters by TOPTIER only — it brings
--  Census (1,106 rows), NOAA (2,909) and USPTO (2,467), all clearance-free.
--  Nothing here generalizes to federal contracting as a whole.
--
--  CLEARANCE NOTE (this drives agency choice): HHS, VA, SSA and Commerce work
--  is essentially all public-trust/suitability — no clearance. Treasury (added
--  2026-09-14; mostly IRS) is likewise public trust. DHS is MIXED:
--  USCIS and FEMA generally don't require one; CBP, ICE, TSA, USSS and Coast
--  Guard skew toward requiring one. Query 7 filters accordingly.
-- ============================================================================


-- ── 0 · READ FIRST: the offer-count trap ────────────────────────────────────
-- `number_of_offers_received` is contaminated and will embarrass you if quoted
-- raw. Rows with a BLANK contract_award_type (n=2,227) average 78.4 offers with
-- 47% above 50 — those are parent IDIQ/vehicle awards counting offers on the
-- vehicle, not the order. PURCHASE ORDER maxes at 999, an obvious sentinel.
-- Real order-level competition is 2–3 offers.
--
-- Every query below that touches offers therefore filters:
--     number_of_offers_received BETWEEN 1 AND 50
--     AND NULLIF(contract_award_type, '') IS NOT NULL
SELECT contract_award_type, COUNT(*) AS n,
       ROUND(AVG(number_of_offers_received), 1)                            AS avg_offers,
       MAX(number_of_offers_received)                                      AS max_offers,
       ROUND(100.0 * AVG(CASE WHEN number_of_offers_received > 50 THEN 1 ELSE 0 END), 1) AS pct_over_50
FROM raw.award_transactions
WHERE number_of_offers_received IS NOT NULL
GROUP BY 1
ORDER BY n DESC;


-- ── 1 · Competition theater ─────────────────────────────────────────────────
-- Of awards labeled FULL AND OPEN COMPETITION, how many drew exactly one bid?
-- Result on the 5-agency data: SSA 61.9%, DHS 60.1%, HHS 55.6%, VA 55.0%,
-- Commerce 54.3% — $39.0B where the competitive label describes the procedure,
-- not the outcome. The strongest finding in the dataset; needs no scoring model.
--
-- SSA is the worst offender, which only became visible once SSA was added.
--
-- This one gets STRONGER when the vehicle artifacts are excluded (unfiltered it
-- reads ~6 pts lower), because the artifact rows are all high-offer.
SELECT awarding_agency_name,
       COUNT(*)                                                              AS n_full_open,
       SUM(CASE WHEN number_of_offers_received = 1 THEN 1 ELSE 0 END)        AS single_offer,
       ROUND(100.0 * AVG(CASE WHEN number_of_offers_received = 1 THEN 1 ELSE 0 END), 1) AS pct,
       ROUND(SUM(CASE WHEN number_of_offers_received = 1
                      THEN total_dollars_obligated ELSE 0 END) / 1e6, 1)     AS dollars_m
FROM raw.award_transactions
WHERE extent_competed LIKE 'FULL AND OPEN COMPETITION%'
  AND number_of_offers_received BETWEEN 1 AND 50
  AND NULLIF(contract_award_type, '') IS NOT NULL
GROUP BY 1
ORDER BY pct DESC;


-- ── 2 · The set-aside ladder ────────────────────────────────────────────────
-- Offer counts by set-aside type, artifacts excluded:
--   8A COMPETED                         4.4 offers avg, 50.3% single-offer
--   SERVICE DISABLED VET OWNED SB       3.6 offers avg, 19.6% single-offer
--   SMALL BUSINESS SET ASIDE - TOTAL    3.3 offers avg, 46.6% single-offer
--   NO SET ASIDE USED                   1.5 offers avg, 81.6% single-offer  (!)
--   8(A) SOLE SOURCE                    1.0 offers avg, 99.6% single-offer
-- Unrestricted full-and-open work draws FEWER bidders than set-aside work.
--
-- CAUTION: unfiltered, this table reads 32.1 avg offers for small-business
-- set-asides vs 6.5 for unrestricted — a ~10x spread that is almost entirely
-- the IDIQ-vehicle artifact from query 0. The DIRECTION survives cleaning; the
-- MAGNITUDE does not. Cite the direction only.
SELECT COALESCE(NULLIF(type_of_set_aside, ''), '(none)')                     AS set_aside,
       COUNT(*)                                                              AS n,
       ROUND(AVG(number_of_offers_received), 1)                              AS avg_offers,
       ROUND(100.0 * AVG(CASE WHEN number_of_offers_received = 1 THEN 1 ELSE 0 END), 1) AS pct_single,
       ROUND(SUM(total_dollars_obligated) / 1e6, 1)                          AS dollars_m
FROM raw.award_transactions
WHERE number_of_offers_received BETWEEN 1 AND 50
  AND NULLIF(contract_award_type, '') IS NOT NULL
GROUP BY 1
HAVING COUNT(*) >= 100
ORDER BY n DESC;


-- ── 3 · The scores don't discriminate ───────────────────────────────────────
-- 54.1% of the 3,658 recompete candidates are tied at incumbent_strength = 65.
-- Ties get broken by total_obligated downstream, so the ranked list on the site
-- is close to "sorted by contract size."
--
-- 65 is the STRUCTURAL MAXIMUM, not a coincidence: is_lifetime_pts caps at 30,
-- is_breadth_pts at 15, is_recency_pts at 20. The model header calls both
-- scores "0-100" and the least(100, ...) wrappers never bind — recompete_score
-- likewise cannot exceed 60 (30+15+15).
--
-- Worse, is_lifetime_pts = least(30, (ln(lifetime)*2)::int) hits its ceiling at
-- e^15 = $3.27M, which 23.9% of vendors already exceed. A $3.3M vendor and a
-- $9.2B vendor score IDENTICALLY. That is why query 6 finds no relationship
-- between "strength" and actual retention — the score cannot separate them.
--
-- Saturation got WORSE after the 2026-08-07 expansion (52.5% -> 54.1%), as
-- predicted: vendor_totals in the dbt model aggregates per recipient_uei with
-- no NAICS grouping, so adding 518210 pushed more vendors into the caps.
SELECT incumbent_strength,
       COUNT(*)                                                  AS n,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)        AS pct
FROM dev_marts.mart_recompete_candidates
GROUP BY 1
ORDER BY n DESC
LIMIT 8;


-- ── 4 · Does incumbent_strength track competitive pressure? ──────────────────
-- If the score measured defensibility, strong incumbents should sit on
-- contracts that attract fewer bidders. Correlation is 0.0145 on the expanded
-- data (n=2,725) — nothing. And single-offer rate falls as strength rises,
-- which is backwards. Held at 0.023 on the pre-expansion 2-NAICS slice too, so
-- this is not an artifact of scope.
WITH j AS (
    SELECT c.incumbent_strength AS s, r.number_of_offers_received AS off
    FROM dev_marts.mart_recompete_candidates c
    JOIN raw.award_transactions r USING (award_unique_key)
    WHERE r.number_of_offers_received BETWEEN 1 AND 50
      AND NULLIF(r.contract_award_type, '') IS NOT NULL
),
b AS (SELECT s, off, NTILE(4) OVER (ORDER BY s) AS q FROM j)
SELECT q, MIN(s) AS s_min, MAX(s) AS s_max, COUNT(*) AS n,
       ROUND(AVG(off), 2)                                                AS avg_offers,
       ROUND(100.0 * AVG(CASE WHEN off = 1 THEN 1 ELSE 0 END), 1)        AS pct_single_offer
FROM b
GROUP BY q
ORDER BY q;


-- ── 5 · Recompete backtest, with a placebo control ──────────────────────────
-- There are no explicit predecessor->successor links, so we infer them: for an
-- award that has ended, look for a follow-on in the same awarding OFFICE and
-- PSC, starting within [-180d, +365d] of the end date, picking the successor
-- closest in dollar magnitude.
--
-- Inferred links are noisy, so the placebo window (+3y to +5y out, where no
-- causal follow-on should exist) tells you how much is real:
--     near window     30.1% incumbent retained  (n=10,393)
--     placebo window  11.3% incumbent retained  (n=3,687)
-- Re-run 2026-09-14 on 6 agencies (Treasury added): near 30.5% (n=12,299),
-- placebo 11.4% (n=4,200) — same 2.7x lift.
-- A 2.7x lift means the match key is capturing something, but a good share of
-- "near" matches are still unrelated contracts. Treat the LEVEL as soft.
--
-- Pre-expansion (3 agencies, 2 NAICS) this read 27.9% vs 7.1%, a 3.9x lift.
-- Same conclusion, and the sample is now 54% larger; the lift shrank because
-- the wider slice adds more same-office/PSC contracts that are genuinely
-- unrelated, which inflates the placebo baseline more than the near window.
--
-- (An earlier, looser key of sub_agency+NAICS gave 7.5% vs 3.3% — barely
-- better than chance. The office+PSC key is what made this work.)
WITH a AS (
    SELECT m.award_unique_key AS k, r.awarding_office_code AS oc, r.psc_code AS psc,
           m.recipient_uei AS uei, m.pop_start_date AS sd,
           m.pop_current_end_date AS ed, m.total_obligated AS d
    FROM dev_marts.mart_awards m
    JOIN raw.award_transactions r USING (award_unique_key)
    WHERE r.awarding_office_code IS NOT NULL AND r.psc_code IS NOT NULL
      AND m.recipient_uei IS NOT NULL AND m.total_obligated > 250000
),
e AS (SELECT * FROM a WHERE ed < CURRENT_DATE AND ed > '2010-01-01'),
m AS (
    SELECT e.k, e.uei, s.uei AS suei,
           CASE WHEN s.sd BETWEEN e.ed - 180  AND e.ed + 365  THEN 'near'
                WHEN s.sd BETWEEN e.ed + 1095 AND e.ed + 1825 THEN 'placebo' END AS w,
           ROW_NUMBER() OVER (
               PARTITION BY e.k,
                   CASE WHEN s.sd BETWEEN e.ed - 180  AND e.ed + 365  THEN 'near'
                        WHEN s.sd BETWEEN e.ed + 1095 AND e.ed + 1825 THEN 'placebo' END
               ORDER BY ABS(LN(GREATEST(s.d, 1)) - LN(GREATEST(e.d, 1)))) AS rn
    FROM e
    JOIN a s ON s.oc = e.oc AND s.psc = e.psc AND s.k <> e.k
)
SELECT w, COUNT(*) AS n,
       ROUND(100.0 * AVG(CASE WHEN suei = uei THEN 1 ELSE 0 END), 2) AS pct_incumbent_retained
FROM m
WHERE rn = 1 AND w IS NOT NULL
GROUP BY w
ORDER BY w;


-- ── 6 · Who actually holds on: retention by incumbent size ──────────────────
-- The payoff query. incumbent_strength awards points for lifetime dollars
-- (is_lifetime_pts), so bigger incumbent = "stronger." The data says otherwise:
--     Q1  $0.3–18.4M     28.8% retained
--     Q2  $18.4–82.1M    37.7% retained   <- best
--     Q3  $82.1–228.8M   28.7%
--     Q4  $228.8M–1.05B  31.1%
--     Q5  $1.05–10.5B    24.1% retained   <- worst
-- Non-monotonic and inverted at the top. Mid-size specialists defend work best;
-- the largest primes retain least. The score's size term is, if anything,
-- pointed the wrong way. $18.4–82.1M is the band query 7 targets.
--
-- REPLICATED. The pre-expansion run (3 agencies, 2 NAICS, n=1,351 per quintile)
-- gave 22.9 / 38.8 / 28.4 / 27.6 / 22.0 — same shape, peak at Q2 and trough at
-- Q5. Re-running on 5 agencies x 3 NAICS with n=2,079 per quintile reproduced
-- it. That survival across a 54% data increase is the strongest evidence here.
--
-- REPLICATED AGAIN 2026-09-14 on 6 agencies x 3 NAICS (Treasury added,
-- n=2,460 per quintile):
--     Q1  $0.3–20.7M     28.0%
--     Q2  $20.8–87.7M    36.3%   <- best
--     Q3  $87.7–238.3M   29.3%
--     Q4  $238.3M–1.28B  31.5%
--     Q5  $1.28–10.9B    27.4%   <- worst
-- Same shape a third time. The Q2–Q5 gap narrowed (13.6 -> 8.9 pts), and the
-- band edges drift upward as scope grows because lifetime_obligated only counts
-- in-scope dollars — rebase query 7's band after every scope change.
--
-- CAVEAT — look-ahead bias: mart_vendors.lifetime_obligated is as-of-today,
-- not as-of-contract-end, so a vendor that grew after winning is scored on its
-- later size. Fixing this needs point-in-time vendor rollups. Read the ORDERING
-- as the finding, not the exact percentages.
WITH a AS (
    SELECT m.award_unique_key AS k, r.awarding_office_code AS oc, r.psc_code AS psc,
           m.recipient_uei AS uei, m.pop_start_date AS sd,
           m.pop_current_end_date AS ed, m.total_obligated AS d
    FROM dev_marts.mart_awards m
    JOIN raw.award_transactions r USING (award_unique_key)
    WHERE r.awarding_office_code IS NOT NULL AND r.psc_code IS NOT NULL
      AND m.recipient_uei IS NOT NULL AND m.total_obligated > 250000
),
e AS (SELECT * FROM a WHERE ed < CURRENT_DATE AND ed > '2010-01-01'),
m AS (
    SELECT e.k, e.uei, s.uei AS suei,
           ROW_NUMBER() OVER (PARTITION BY e.k
               ORDER BY ABS(LN(GREATEST(s.d, 1)) - LN(GREATEST(e.d, 1)))) AS rn
    FROM e
    JOIN a s ON s.oc = e.oc AND s.psc = e.psc AND s.k <> e.k
           AND s.sd BETWEEN e.ed - 180 AND e.ed + 365
),
res AS (
    SELECT CASE WHEN m.suei = m.uei THEN 1 ELSE 0 END AS retained,
           v.lifetime_obligated AS lo,
           NTILE(5) OVER (ORDER BY v.lifetime_obligated) AS q
    FROM m
    JOIN dev_marts.mart_vendors v ON v.vendor_uei = m.uei
    WHERE m.rn = 1
)
SELECT q, COUNT(*) AS n,
       ROUND(MIN(lo) / 1e6, 1) AS min_m,
       ROUND(MAX(lo) / 1e6, 1) AS max_m,
       ROUND(100.0 * AVG(retained), 1) AS pct_retained
FROM res
GROUP BY q
ORDER BY q;


-- ── 7 · Job targeting: clearance-free, growing AND exposed ──────────────────
-- The one targeting query. Finds local firms that just WON new work (funded
-- headcount, unlike a recompete which is only speculative headcount) AND have
-- contracts recompeting soon — growing and exposed at once, which is when a
-- company notices it can't track its own portfolio in spreadsheets.
--
-- "New win" = a BEACHHEAD: an award started in the last 12 months where the
-- vendor had NO prior award at that awarding office + PSC. Roughly 50% of
-- recent >$1M awards qualify, so it discriminates. Without this test you can't
-- tell a genuine new win from a recompete the incumbent simply retained —
-- there is no modification history to lean on.
--
-- Ordered by win recency, which is the whole game for a hiring signal.
--
-- CLEARANCE FILTER: whole-agency for HHS / VA / SSA / Commerce / Treasury (all
-- public trust). DHS only via USCIS and FEMA — CBP, ICE, TSA, USSS and Coast Guard
-- are excluded because they skew toward requiring a clearance. This dropped
-- four previously-recommended firms (ASET Partners/USSS, Alpha Omega/ICE,
-- AreteCSBD/CBP, Patriot/CBP) that were unreachable without one.
--
-- SIZE BAND rebased to $20.8–87.7M on 2026-09-14, the Q2 retention sweet spot
-- recomputed after adding Treasury (quintiles: 28.0 / 36.3 / 29.3 / 31.5 / 27.4
-- % retained). Previously $18.4–82.1M on the 5-agency data. Rebase again after
-- any scope change: a vendor's in-scope lifetime grows when its other agencies
-- are added (FedTec went $51.4M -> $91.1M from 19 Treasury awards).
--
-- Results (2026-08-07), most recent win first:
--   RAVENTEK           2026-07-22  $3.5M  HHS/ASFR   2 recompetes / $4.4M
--   DYNANET            2026-05-20  $3.6M  NIH        4 / $20.1M
--   ARCH SYSTEMS       2026-03-29  $4.2M  HHS/ASFR   3 / $19.0M
--   FEDTEC             2026-03-24  $22.0M SSA        4 / $40.8M   <- biggest
--   WHIRLWIND TECH     2026-01-22  $2.6M  Census     1 / $2.6M
--   HLINC              2026-01-01  $2.8M  VA         1 / $10.2M
-- FedTec and Whirlwind exist here only because SSA and Commerce were added.
--
-- FIVE TRAPS, every one of which produced a wrong answer before being caught:
--
-- 1. FISCAL-YEAR CLUSTERING. Most awards start on/near 09-30, and 30.4% of
--    expirations land in September. A "recent win" dated 2025-09-30 is FY-end
--    routine, ~11 months stale, and that team is already built. "Contracts
--    expiring in September" is the calendar, not distress — do not pitch it as
--    if you spotted something. Sort by recency and distrust the September pile.
--
-- 2. JOINT VENTURES. Ranking on "new win as % of lifetime book" surfaces firms
--    at 100% — but those are mostly JVs and single-purpose entities (STELLA JV,
--    ACT-JV, ASRC FEDERAL AGILE). A JV holding one contract does not hire; its
--    parents do. The name regex below is crude and WILL miss some. Eyeball any
--    hyphenated or shell-sounding name before acting on it.
--
-- 3. lifetime_obligated IS SCOPE-LIMITED, NOT COMPANY SIZE. It counts only the
--    5 agencies x 3 NAICS in this database. LEIDOS shows up at $17.1M in-scope
--    and sails straight through a "small firm" size filter.
--
-- 4. DUPLICATE VENDOR ENTITIES. LEIDOS appears under THREE separate UEIs
--    ($0.0M / $17.1M / $0.7M in-scope). Entity resolution is unfinished — see
--    data/vendor_manual_merges.csv. Any per-vendor total here may be split
--    across UEIs and understated, including for firms you want to contact.
--
-- 5. months_to_pop_end = 0 INCLUDES ALREADY-PAST END DATES. Filter on
--    pop_current_end_date >= CURRENT_DATE for anything forward-looking, which
--    is what the rec CTE below does.
--
-- AND THE REAL LIMIT: hiring intent is not in this data. A new award implies
-- headcount but does not prove an open req, and says nothing about whether they
-- need a data engineer or six Java developers. This narrows ~700 local vendors
-- to a dozen worth checking. Cross-reference LinkedIn and careers pages before
-- contacting anyone. Also verify location — recipient_state_code is a
-- REGISTERED address, often a legal HQ rather than where engineering sits.
WITH a AS (
    SELECT m.award_unique_key AS k, r.awarding_office_code AS oc, r.psc_code AS psc,
           m.recipient_uei AS uei, m.pop_start_date AS sd, m.total_obligated AS d,
           m.awarding_sub_agency_name AS sub, m.awarding_agency_name AS ag,
           r.recipient_state_code AS st
    FROM dev_marts.mart_awards m
    JOIN raw.award_transactions r USING (award_unique_key)
    WHERE r.awarding_office_code IS NOT NULL AND r.psc_code IS NOT NULL
      AND m.recipient_uei IS NOT NULL
),
clearance_free AS (
    SELECT * FROM a
    WHERE ag IN ('Department of Health and Human Services',
                 'Department of Veterans Affairs',
                 'Social Security Administration',
                 'Department of Commerce',
                 'Department of the Treasury')
       OR sub IN ('U.S. Citizenship and Immigration Service',
                  'Federal Emergency Management Agency')
),
wins AS (           -- most recent beachhead win per vendor, clearance-free only
    SELECT DISTINCT ON (n.uei) n.uei, n.sd, n.d, n.sub
    FROM clearance_free n
    WHERE n.sd BETWEEN CURRENT_DATE - 365 AND CURRENT_DATE
      AND n.d > 2000000
      AND n.st IN ('VA', 'MD', 'DC')                      -- <- your market
      -- beachhead test runs against ALL work, so prior cleared-agency presence
      -- at the same office+PSC still disqualifies it as "new"
      AND NOT EXISTS (SELECT 1 FROM a p
                      WHERE p.oc = n.oc AND p.psc = n.psc
                        AND p.uei = n.uei AND p.sd < n.sd)
    ORDER BY n.uei, n.sd DESC, n.d DESC
),
rec AS (
    SELECT recipient_uei AS uei, COUNT(*) AS rc, SUM(total_obligated) AS exp_d
    FROM dev_marts.mart_recompete_candidates
    WHERE pop_current_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 550
      AND (awarding_agency_name IN ('Department of Health and Human Services',
                                    'Department of Veterans Affairs',
                                    'Social Security Administration',
                                    'Department of Commerce',
                                    'Department of the Treasury')
        OR awarding_sub_agency_name IN ('U.S. Citizenship and Immigration Service',
                                        'Federal Emergency Management Agency'))
    GROUP BY 1
)
SELECT v.vendor_name, w.sub AS win_agency, w.sd AS win_date,
       ROUND(w.d / 1e6, 1) AS win_m,
       r.rc AS recompetes, ROUND(r.exp_d / 1e6, 1) AS exposure_m,
       ROUND(v.lifetime_obligated / 1e6, 1) AS lifetime_m
FROM wins w
JOIN dev_marts.mart_vendors v ON v.vendor_uei = w.uei
JOIN rec r ON r.uei = w.uei
WHERE v.lifetime_obligated BETWEEN 20800000 AND 87700000   -- rebased sweet spot (2026-09-14)
  AND v.vendor_name !~* '(^| )JV|JOINT VENTURE| - '
ORDER BY w.sd DESC
LIMIT 25;
