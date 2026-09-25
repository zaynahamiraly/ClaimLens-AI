double? _number(dynamic value) => value == null ? null : double.tryParse(value.toString());

class ClaimSummary {
  const ClaimSummary({
    required this.id,
    required this.reference,
    required this.patientName,
    required this.providerName,
    required this.currency,
    required this.status,
    required this.warningCount,
    required this.createdAt,
    this.claimedAmount,
    this.assignedTo,
  });

  final String id;
  final String reference;
  final String patientName;
  final String providerName;
  final double? claimedAmount;
  final String currency;
  final String status;
  final int warningCount;
  final DateTime createdAt;
  final String? assignedTo;

  factory ClaimSummary.fromJson(Map<String, dynamic> json) => ClaimSummary(
        id: json['id'] as String,
        reference: json['reference'] as String,
        patientName: json['patient_name'] as String? ?? '',
        providerName: json['provider_name'] as String? ?? '',
        claimedAmount: _number(json['claimed_amount']),
        currency: json['currency'] as String? ?? 'MUR',
        status: json['status'] as String,
        warningCount: json['warning_count'] as int? ?? 0,
        createdAt: DateTime.parse(json['created_at'] as String),
        assignedTo: json['assigned_to'] as String?,
      );
}

class ExtractedField {
  const ExtractedField({
    required this.id,
    required this.fieldName,
    required this.normalizedValue,
    required this.confidence,
    required this.extractionMethod,
    this.documentId,
  });

  final String id;
  final String fieldName;
  final String normalizedValue;
  final double confidence;
  final String extractionMethod;
  final String? documentId;

  factory ExtractedField.fromJson(Map<String, dynamic> json) => ExtractedField(
        id: json['id'] as String,
        fieldName: json['field_name'] as String,
        normalizedValue: json['normalized_value'] as String,
        confidence: _number(json['confidence']) ?? 0,
        extractionMethod: json['extraction_method'] as String,
        documentId: json['document_id'] as String?,
      );
}

class ClaimDocument {
  const ClaimDocument({
    required this.id,
    required this.originalName,
    required this.documentType,
    required this.mimeType,
    required this.extractionStatus,
    required this.includeInTotal,
    required this.fields,
    this.extractedAmount,
    this.extractedCurrency,
    this.confirmedAmount,
    this.confirmedCurrency,
    this.amountConfidence,
    this.duplicateOf,
    this.extractionNotes,
    this.signedUrl,
  });

  final String id;
  final String originalName;
  final String documentType;
  final String mimeType;
  final String extractionStatus;
  final double? extractedAmount;
  final String? extractedCurrency;
  final double? confirmedAmount;
  final String? confirmedCurrency;
  final double? amountConfidence;
  final bool includeInTotal;
  final String? duplicateOf;
  final String? extractionNotes;
  final String? signedUrl;
  final List<ExtractedField> fields;

  factory ClaimDocument.fromJson(Map<String, dynamic> json) => ClaimDocument(
        id: json['id'] as String,
        originalName: json['original_name'] as String,
        documentType: json['document_type'] as String,
        mimeType: json['mime_type'] as String,
        extractionStatus: json['extraction_status'] as String? ?? 'PENDING',
        extractedAmount: _number(json['extracted_amount']),
        extractedCurrency: json['extracted_currency'] as String?,
        confirmedAmount: _number(json['confirmed_amount']),
        confirmedCurrency: json['confirmed_currency'] as String?,
        amountConfidence: _number(json['amount_confidence']),
        includeInTotal: json['include_in_total'] as bool? ?? false,
        duplicateOf: json['duplicate_of'] as String?,
        extractionNotes: json['extraction_notes'] as String?,
        signedUrl: json['signed_url'] as String?,
        fields: (json['fields'] as List<dynamic>? ?? const [])
            .map((item) => ExtractedField.fromJson(item as Map<String, dynamic>))
            .toList(),
      );
}

class ClaimDetails extends ClaimSummary {
  const ClaimDetails({
    required super.id,
    required super.reference,
    required super.patientName,
    required super.providerName,
    required super.currency,
    required super.status,
    required super.warningCount,
    required super.createdAt,
    required this.documents,
    required this.auditEvents,
    super.claimedAmount,
    super.assignedTo,
  });

  final List<ClaimDocument> documents;
  final List<Map<String, dynamic>> auditEvents;

  factory ClaimDetails.fromJson(Map<String, dynamic> json) {
    final base = ClaimSummary.fromJson(json);
    return ClaimDetails(
      id: base.id,
      reference: base.reference,
      patientName: base.patientName,
      providerName: base.providerName,
      claimedAmount: base.claimedAmount,
      currency: base.currency,
      status: base.status,
      warningCount: base.warningCount,
      createdAt: base.createdAt,
      assignedTo: base.assignedTo,
      documents: (json['documents'] as List<dynamic>? ?? const [])
          .map((item) => ClaimDocument.fromJson(item as Map<String, dynamic>))
          .toList(),
      auditEvents: (json['audit_events'] as List<dynamic>? ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList(),
    );
  }
}

class DashboardData {
  const DashboardData({required this.total, required this.processing, required this.reviewRequired, required this.verified, required this.failed, required this.recent});
  final int total;
  final int processing;
  final int reviewRequired;
  final int verified;
  final int failed;
  final List<ClaimSummary> recent;

  factory DashboardData.fromJson(Map<String, dynamic> json) => DashboardData(
        total: json['total_claims'] as int,
        processing: json['processing'] as int,
        reviewRequired: json['review_required'] as int,
        verified: json['verified'] as int,
        failed: json['processing_failed'] as int,
        recent: (json['recent_claims'] as List<dynamic>).map((item) => ClaimSummary.fromJson(item as Map<String, dynamic>)).toList(),
      );
}

class DocumentConfirmation {
  DocumentConfirmation({required this.document, required this.include, required this.amount, required this.currency});
  final ClaimDocument document;
  bool include;
  double? amount;
  String currency;

  Map<String, dynamic> toJson() => {'id': document.id, 'include': include, 'amount': amount, 'currency': currency};
}

class FieldCorrection {
  const FieldCorrection({required this.id, required this.label, required this.value});
  final String id;
  final String label;
  final String value;
  Map<String, dynamic> toJson() => {'id': id, 'value': value};
}
