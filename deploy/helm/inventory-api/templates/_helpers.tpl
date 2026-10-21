{{- define "inv.name" -}}{{ .Release.Name }}{{- end -}}
{{- define "inv.labels" -}}
app.kubernetes.io/name: inventory-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "inv.dburl" -}}
postgres://{{ .Values.postgres.user }}:{{ .Values.postgres.password }}@{{ include "inv.name" . }}-postgres:5432/{{ .Values.postgres.database }}?sslmode=disable
{{- end -}}
