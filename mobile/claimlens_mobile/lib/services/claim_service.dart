import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../models/claim.dart';
import '../models/selected_document.dart';
import 'api_client.dart';

class ClaimService {
  const ClaimService(this.client);
  final ApiClient client;

  Future<DashboardData> dashboard() async {
    final response = await client.dio.get<Map<String, dynamic>>('/claims/dashboard');
    return DashboardData.fromJson(response.data!);
  }

  Future<List<ClaimSummary>> list({String? search, String? status}) async {
    final response = await client.dio.get<List<dynamic>>('/claims', queryParameters: {
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      if (status != null && status.isNotEmpty) 'status': status,
    });
    return response.data!.map((item) => ClaimSummary.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<ClaimDetails> create(List<SelectedDocument> documents) async {
    final data = FormData();
    for (final document in documents) {
      data.files.add(MapEntry('files', MultipartFile.fromBytes(document.bytes, filename: document.name, contentType: MediaType.parse(document.mimeType))));
    }
    final response = await client.dio.post<Map<String, dynamic>>('/claims', data: data);
    return ClaimDetails.fromJson(response.data!);
  }

  Future<ClaimDetails> details(String reference) async {
    final response = await client.dio.get<Map<String, dynamic>>('/claims/$reference');
    return ClaimDetails.fromJson(response.data!);
  }

  Future<void> process(String reference) async {
    await client.dio.post<Map<String, dynamic>>('/claims/$reference/process');
  }

  Future<String> confirm(String reference, String patient, String provider, List<DocumentConfirmation> documents, List<FieldCorrection> fields) async {
    final response = await client.dio.post<Map<String, dynamic>>('/claims/$reference/confirm', data: {
      'patient_name': patient,
      'provider_name': provider,
      'documents': documents.map((document) => document.toJson()).toList(),
      'fields': fields.map((field) => field.toJson()).toList(),
    });
    return response.data!['status'] as String;
  }
}
