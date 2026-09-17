{{ config(materialized='table') }}
{#
  Training/validation set for the scoring models (pipelines/fit_scores.py).

  Grain: one row per ENDED award (>$250K, ended 2012 .. 1 year ago, so the
  follow-on window is fully observable).

  There are no explicit predecessor->successor links in USASpending, so we infer
  them: a follow-on is an award in the same awarding office AND PSC starting
  within [-180d, +365d] of the end date, closest in dollar magnitude. A placebo
  follow-on is picked the same way 3-5 years out, where no causal link should
  exist — the gap between the two is the real signal (sql/analysis.sql §5).

  Features are POINT-IN-TIME: history only counts awards that started more than
  180 days before the end date, so a successor can never leak into the features
  that are meant to predict it.
#}

with a as (
    select
        award_unique_key       as k,
        awarding_office_code   as oc,
        psc_code               as psc,
        recipient_uei          as uei,
        pop_start_date         as sd,
        pop_current_end_date   as ed,
        total_obligated        as d,
        contract_award_type,
        extent_competed,
        type_of_contract_pricing
    from {{ ref('mart_awards') }}
    where awarding_office_code is not null
      and psc_code is not null
      and recipient_uei is not null
      and pop_start_date is not null
      and total_obligated > 250000
),

ended as (
    select *, ed - 180 as asof
    from a
    where ed < current_date - 365
      and ed > date '2012-01-01'
),

near as (
    select e.k, s.uei as next_uei,
           row_number() over (
               partition by e.k
               order by abs(ln(greatest(s.d, 1)) - ln(greatest(e.d, 1)))
           ) as rn
    from ended e
    join a s
      on s.oc = e.oc and s.psc = e.psc and s.k <> e.k
     and s.sd between e.ed - 180 and e.ed + 365
),

placebo as (
    select e.k, s.uei as next_uei,
           row_number() over (
               partition by e.k
               order by abs(ln(greatest(s.d, 1)) - ln(greatest(e.d, 1)))
           ) as rn
    from ended e
    join a s
      on s.oc = e.oc and s.psc = e.psc and s.k <> e.k
     and s.sd between e.ed + 1095 and e.ed + 1825
),

tenure as (
    select e.k, count(p.k) as officepsc_prior_n
    from ended e
    left join a p
      on p.uei = e.uei and p.oc = e.oc and p.psc = e.psc
     and p.k <> e.k and p.sd < e.asof
    group by e.k
),

market as (
    select e.k,
           sum(p.d) filter (where p.uei = e.uei) / nullif(sum(p.d), 0) as office_share,
           count(distinct p.uei)                                        as office_vendors
    from ended e
    join a p
      on p.oc = e.oc and p.psc = e.psc
     and p.sd between e.asof - 1825 and e.asof
    group by e.k
)

select
    e.k                                                     as award_unique_key,
    e.ed                                                    as pop_end_date,
    e.d                                                     as total_obligated,
    m.office_share,
    m.office_vendors,
    t.officepsc_prior_n,

    -- retention-model features
    {{ bin_office_share('m.office_share') }}                as f_share,
    {{ bin_rivals('m.office_vendors') }}                    as f_rivals,
    {{ bin_tenure('t.officepsc_prior_n') }}                 as f_tenure,
    {{ vehicle('e.contract_award_type') }}                  as f_vehicle,
    {{ sole_source('e.extent_competed') }}                  as f_sole,
    {{ bin_duration_retention('e.sd', 'e.ed') }}            as f_dur_ret,

    -- follow-on-model features
    {{ bin_duration_followon('e.sd', 'e.ed') }}             as f_dur_fo,
    {{ bin_award_size('e.d') }}                             as f_size,
    {{ pricing_group('e.type_of_contract_pricing') }}       as f_pricing,

    -- outcomes
    n.next_uei is not null                                  as has_followon,
    n.next_uei = e.uei                                      as retained,
    p.next_uei is not null                                  as has_placebo,
    p.next_uei = e.uei                                      as placebo_retained

from ended e
join tenure t on t.k = e.k
left join market m on m.k = e.k
left join near n on n.k = e.k and n.rn = 1
left join placebo p on p.k = e.k and p.rn = 1
