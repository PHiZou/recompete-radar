{#
  Recompete candidates with explainable, backtested scoring.

  Grain: one row per award (award_unique_key).
  Filters: active window only — POP-end between 3 months ago and 36 months out.

  Two probability models, fitted by pipelines/fit_scores.py on
  int_score_backtest and stored as log-odds weights in seeds/score_weights.csv:

    retention_prob  P(incumbent wins the follow-on | there is one)
    followon_prob   P(a follow-on award happens at all)

  Published scores (0-100):

    incumbent_strength = 100 * retention_prob
    recompete_score    = 100 * followon_prob * (1 - retention_prob)
                         -> the chance this turns into work a NEW vendor wins

  Timing is deliberately NOT in the score; filter/sort on months_to_pop_end.
  Every per-feature weight is exposed so the UI can show *why*.

  The follow-on links behind the training data are inferred, so read the
  scores as a RANKING. Levels are rough (see sql/analysis.sql §3).
#}

with awards as (
    select * from {{ ref('mart_awards') }}
),

weights as (
    select model, feature, level, weight from {{ ref('score_weights') }}
),

active as (
    select
        *,
        (extract(year from age(pop_current_end_date, current_date)) * 12
         + extract(month from age(pop_current_end_date, current_date)))::int
            as months_to_pop_end
    from awards
    where pop_current_end_date is not null
      and pop_current_end_date >= current_date - interval '3 months'
      and pop_current_end_date <= current_date + interval '36 months'
),

-- Same population int_score_backtest draws history from; keep them in sync.
pool as (
    select award_unique_key as k, awarding_office_code as oc, psc_code as psc,
           recipient_uei as uei, pop_start_date as sd, total_obligated as d
    from awards
    where awarding_office_code is not null
      and psc_code is not null
      and recipient_uei is not null
      and pop_start_date is not null
      and total_obligated > 250000
),

-- Market structure as of today: trailing 5 years in the same office + PSC.
market as (
    select a.award_unique_key,
           sum(p.d) filter (where p.uei = a.recipient_uei) / nullif(sum(p.d), 0) as office_share,
           count(distinct p.uei)                                                as office_vendors
    from active a
    join pool p
      on p.oc = a.awarding_office_code and p.psc = a.psc_code
     and p.sd between current_date - 1825 and current_date
    group by 1
),

tenure as (
    select a.award_unique_key, count(*) as officepsc_prior_n
    from active a
    join pool p
      on p.uei = a.recipient_uei and p.oc = a.awarding_office_code
     and p.psc = a.psc_code and p.k <> a.award_unique_key
     and p.sd < current_date
    group by 1
),

featured as (
    select
        a.*,
        m.office_share,
        coalesce(m.office_vendors, 0)                                   as office_vendors,
        coalesce(t.officepsc_prior_n, 0)                                as officepsc_prior_n,
        {{ bin_office_share('m.office_share') }}                        as f_share,
        {{ bin_rivals('m.office_vendors') }}                            as f_rivals,
        {{ bin_tenure('t.officepsc_prior_n') }}                         as f_tenure,
        {{ vehicle('a.contract_award_type') }}                          as f_vehicle,
        {{ sole_source('a.extent_competed') }}                          as f_sole,
        {{ bin_duration_retention('a.pop_start_date', 'a.pop_current_end_date') }} as f_dur_ret,
        {{ bin_duration_followon('a.pop_start_date', 'a.pop_current_end_date') }}  as f_dur_fo,
        {{ bin_award_size('a.total_obligated') }}                       as f_size,
        {{ pricing_group('a.type_of_contract_pricing') }}               as f_pricing
    from active a
    left join market m on m.award_unique_key = a.award_unique_key
    left join tenure t on t.award_unique_key = a.award_unique_key
),

{%- set retention = [('share', 'f_share'), ('rivals', 'f_rivals'), ('tenure', 'f_tenure'),
                     ('vehicle', 'f_vehicle'), ('sole_source', 'f_sole'), ('duration', 'f_dur_ret')] %}
{%- set followon = [('vehicle', 'f_vehicle'), ('duration', 'f_dur_fo'),
                    ('size', 'f_size'), ('pricing', 'f_pricing')] %}

weighted as (
    select
        f.*,
        {%- for feat, col in retention %}
        coalesce(r_{{ feat }}.weight, 0) as ret_{{ feat }}_w,
        {%- endfor %}
        {%- for feat, col in followon %}
        coalesce(f_{{ feat }}.weight, 0) as fo_{{ feat }}_w,
        {%- endfor %}
        ri.weight as ret_intercept,
        fi.weight as fo_intercept
    from featured f
    cross join (select weight from weights where model = 'retention' and feature = 'intercept') ri
    cross join (select weight from weights where model = 'followon'  and feature = 'intercept') fi
    {%- for feat, col in retention %}
    left join weights r_{{ feat }}
      on r_{{ feat }}.model = 'retention' and r_{{ feat }}.feature = '{{ feat }}'
     and r_{{ feat }}.level = f.{{ col }}
    {%- endfor %}
    {%- for feat, col in followon %}
    left join weights f_{{ feat }}
      on f_{{ feat }}.model = 'followon' and f_{{ feat }}.feature = '{{ feat }}'
     and f_{{ feat }}.level = f.{{ col }}
    {%- endfor %}
),

scored as (
    select
        *,
        {%- set ret_terms = ['ret_intercept'] %}
        {%- for feat, col in retention %}{% do ret_terms.append('ret_' ~ feat ~ '_w') %}{% endfor %}
        {%- set fo_terms = ['fo_intercept'] %}
        {%- for feat, col in followon %}{% do fo_terms.append('fo_' ~ feat ~ '_w') %}{% endfor %}
        {{ inv_logit(ret_terms | join(' + ')) }} as retention_prob,
        {{ inv_logit(fo_terms | join(' + ')) }}  as followon_prob
    from weighted
)

select
    award_unique_key,
    piid,
    parent_piid,
    naics_code,
    naics_description,
    awarding_agency_code,
    awarding_agency_name,
    awarding_sub_agency_code,
    awarding_sub_agency_name,
    awarding_office_code,
    awarding_office_name,
    recipient_uei,
    recipient_name,
    contract_award_type,
    type_of_set_aside,
    extent_competed,
    type_of_contract_pricing,
    pop_start_date,
    pop_current_end_date,
    months_to_pop_end,
    total_obligated,
    base_and_exercised_options_value,
    base_and_all_options_value,

    -- raw feature values + bins (the "why")
    office_share,
    office_vendors,
    officepsc_prior_n,
    f_share, f_rivals, f_tenure, f_vehicle, f_sole, f_dur_ret,
    f_dur_fo, f_size, f_pricing,

    -- per-feature log-odds contributions
    {%- for feat, col in retention %}
    ret_{{ feat }}_w,
    {%- endfor %}
    {%- for feat, col in followon %}
    fo_{{ feat }}_w,
    {%- endfor %}

    retention_prob,
    followon_prob,
    round(100 * retention_prob)::int                          as incumbent_strength,
    round(100 * followon_prob * (1 - retention_prob))::int    as recompete_score

from scored
