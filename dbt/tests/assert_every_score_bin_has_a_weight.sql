-- Fails if a live contract lands in a feature bucket that has no fitted
-- weight. That means the bin macros and seeds/score_weights.csv have drifted
-- apart (the bucket would silently score as baseline). Fix: re-run
-- pipelines/fit_scores.py.
{%- set feats = [
    ('retention', 'share', 'f_share'), ('retention', 'rivals', 'f_rivals'),
    ('retention', 'tenure', 'f_tenure'), ('retention', 'vehicle', 'f_vehicle'),
    ('retention', 'sole_source', 'f_sole'), ('retention', 'duration', 'f_dur_ret'),
    ('followon', 'vehicle', 'f_vehicle'), ('followon', 'duration', 'f_dur_fo'),
    ('followon', 'size', 'f_size'), ('followon', 'pricing', 'f_pricing'),
] %}
with used as (
    {%- for model, feat, col in feats %}
    select distinct '{{ model }}' as model, '{{ feat }}' as feature, {{ col }} as level
    from {{ ref('mart_recompete_candidates') }}
    {% if not loop.last %}union all{% endif %}
    {%- endfor %}
)
select u.*
from used u
left join {{ ref('score_weights') }} w
  on w.model = u.model and w.feature = u.feature and w.level = u.level
where w.level is null
