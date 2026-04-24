{#
  Take the most recent non-null value of `column` ordered by `order_col`.
  Used inside a GROUP BY rollup so we keep the "latest known" classification
  (NAICS, PSC, set-aside, etc.) as the award's canonical value.
#}
{% macro last_non_null(column, order_col) %}
    (array_agg({{ column }} order by {{ order_col }} desc) filter (where {{ column }} is not null))[1]
{% endmacro %}
