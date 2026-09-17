{#
  Feature bins shared by the scoring backtest (int_score_backtest) and the live
  scorer (mart_recompete_candidates). Both models MUST bin identically, or the
  weights fitted on the backtest mean nothing when applied to live contracts.
  Level names here are the `level` keys in seeds/score_weights.csv.
#}

{# Incumbent's share of office+PSC dollars over the trailing 5 years. #}
{% macro bin_office_share(col) %}
    case
        when coalesce({{ col }}, 0) < 0.15 then 'lt15'
        when {{ col }} < 0.30 then '15_30'
        when {{ col }} < 0.50 then '30_50'
        when {{ col }} < 0.80 then '50_80'
        else '80up'
    end
{% endmacro %}

{# Distinct vendors winning in the same office+PSC over the trailing 5 years. #}
{% macro bin_rivals(col) %}
    case
        when coalesce({{ col }}, 0) < 2 then '0_1'
        when {{ col }} < 4 then '2_3'
        when {{ col }} < 8 then '4_7'
        when {{ col }} < 16 then '8_15'
        else '16up'
    end
{% endmacro %}

{# Incumbent's other awards in the same office+PSC. #}
{% macro bin_tenure(col) %}
    case
        when coalesce({{ col }}, 0) < 1 then '0'
        when {{ col }} < 2 then '1'
        when {{ col }} < 4 then '2_3'
        else '4up'
    end
{% endmacro %}

{% macro vehicle(award_type) %}
    case
        when {{ award_type }} like 'BPA%' then 'bpa'
        when {{ award_type }} in ('DELIVERY ORDER', 'DO') then 'order'
        else 'standalone'
    end
{% endmacro %}

{% macro sole_source(extent_competed) %}
    case
        when {{ extent_competed }} in (
            'NOT COMPETED', 'NOT AVAILABLE FOR COMPETITION', 'NOT COMPETED UNDER SAP'
        ) then 'yes'
        else 'no'
    end
{% endmacro %}

{% macro duration_years(start_date, end_date) %}
    (({{ end_date }} - {{ start_date }}) / 365.0)
{% endmacro %}

{# Retention model uses a coarse duration bin... #}
{% macro bin_duration_retention(start_date, end_date) %}
    case
        when {{ duration_years(start_date, end_date) }} < 1 then 'lt1'
        when {{ duration_years(start_date, end_date) }} < 2 then '1_2'
        else '2up'
    end
{% endmacro %}

{# ...the follow-on model a finer one (long contracts rarely get a matched follow-on). #}
{% macro bin_duration_followon(start_date, end_date) %}
    case
        when {{ duration_years(start_date, end_date) }} < 1 then 'lt1'
        when {{ duration_years(start_date, end_date) }} < 2 then '1_2'
        when {{ duration_years(start_date, end_date) }} < 3 then '2_3'
        when {{ duration_years(start_date, end_date) }} < 5 then '3_5'
        else '5up'
    end
{% endmacro %}

{% macro bin_award_size(col) %}
    case
        when {{ col }} < 1e6 then 'lt1m'
        when {{ col }} < 1e7 then '1_10m'
        when {{ col }} < 10 ^ 7.5 then '10_30m'
        else '30mup'
    end
{% endmacro %}

{% macro pricing_group(col) %}
    case
        when {{ col }} in ('LABOR HOURS', 'TIME AND MATERIALS') then 'lh_tm'
        when {{ col }} like 'COST%' then 'cost'
        else 'fixed'
    end
{% endmacro %}

{# Logistic link: log-odds -> probability. #}
{% macro inv_logit(expr) %}
    (1.0 / (1.0 + exp(-({{ expr }}))))
{% endmacro %}
