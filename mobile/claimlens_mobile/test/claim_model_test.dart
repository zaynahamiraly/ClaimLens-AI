import 'package:claimlens_mobile/models/claim.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('claim summary parses numeric Supabase values', () {
    final claim = ClaimSummary.fromJson({
      'id': 'id',
      'reference': 'CLM-20260925-000001',
      'patient_name': 'A Patient',
      'provider_name': 'A Clinic',
      'claimed_amount': '620.00',
      'currency': 'MUR',
      'status': 'REVIEW_REQUIRED',
      'warning_count': 0,
      'created_at': '2026-09-25T10:00:00Z',
      'assigned_to': null,
    });
    expect(claim.claimedAmount, 620);
    expect(claim.reference, 'CLM-20260925-000001');
  });
}
