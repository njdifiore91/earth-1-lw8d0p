{{/*
Generate a consistent name for Matter platform resources
*/}}
{{- define "matter.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Generate full name including release name and region for Matter platform resources
*/}}
{{- define "matter.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- $region := default .Values.global.region.primary .Values.global.region.secondary }}
{{- if contains $name .Release.Name }}
{{- printf "%s-%s" .Release.Name $region | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s-%s" .Release.Name $name $region | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Generate validated service account name with enhanced security checks
*/}}
{{- define "matter.serviceAccountName" -}}
{{- $component := . -}}
{{- $validComponents := list "auth" "search" "planning" "visualization" -}}
{{- if not (has $component $validComponents) }}
{{- fail (printf "Invalid component %s specified for service account. Must be one of: %s" $component ($validComponents | join ", ")) }}
{{- end }}
{{- $serviceAccount := printf "%s-sa-%s" (include "matter.name" .) $component }}
{{- if gt (len $serviceAccount) 63 }}
{{- fail "Service account name exceeds Kubernetes 63 character limit" }}
{{- end }}
{{- if not (regexMatch "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" $serviceAccount) }}
{{- fail "Service account name must consist of alphanumeric characters or '-', and must start/end with an alphanumeric character" }}
{{- end }}
{{- $serviceAccount }}
{{- end }}

{{/*
Generate TLS secret name with enhanced security validations
*/}}
{{- define "matter.tlsSecretName" -}}
{{- $service := . -}}
{{- if not .Values.global.ingress.tls.enabled }}
{{- fail "TLS must be enabled to generate TLS secret names" }}
{{- end }}
{{- if ne .Values.global.ingress.tls.minimumProtocolVersion "TLSv1.3" }}
{{- fail "TLS version must be 1.3 or higher for security compliance" }}
{{- end }}
{{- $region := default .Values.global.region.primary .Values.global.region.secondary }}
{{- $secretName := printf "%s-tls-%s-%s" (include "matter.name" .) $service $region }}
{{- if gt (len $secretName) 253 }}
{{- fail "TLS secret name exceeds Kubernetes 253 character limit" }}
{{- end }}
{{- if not (regexMatch "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" $secretName) }}
{{- fail "TLS secret name must consist of alphanumeric characters or '-', and must start/end with an alphanumeric character" }}
{{- end }}
{{- $secretName }}
{{- end }}

{{/*
Generate common labels for Matter platform resources
*/}}
{{- define "matter.labels" -}}
helm.sh/chart: {{ include "matter.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: matter-platform
{{- end }}

{{/*
Generate selector labels for Matter platform resources
*/}}
{{- define "matter.selectorLabels" -}}
app.kubernetes.io/name: {{ include "matter.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Validate and return security context for Matter platform pods
*/}}
{{- define "matter.podSecurityContext" -}}
{{- with .Values.global.security.securityContext }}
runAsNonRoot: {{ .runAsNonRoot }}
runAsUser: {{ .runAsUser }}
fsGroup: {{ .fsGroup }}
{{- if .capabilities }}
capabilities:
  {{- toYaml .capabilities | nindent 2 }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Generate region-aware service name
*/}}
{{- define "matter.serviceName" -}}
{{- $service := . -}}
{{- $region := default .Values.global.region.primary .Values.global.region.secondary }}
{{- printf "%s-%s-%s" (include "matter.name" .) $service $region | trunc 63 | trimSuffix "-" }}
{{- end }}