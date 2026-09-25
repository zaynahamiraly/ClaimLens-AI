import 'package:flutter/foundation.dart';

import '../models/claim.dart';
import '../services/api_client.dart';
import '../services/claim_service.dart';

class ClaimsProvider extends ChangeNotifier {
  ClaimsProvider(ApiClient client) : service = ClaimService(client);
  final ClaimService service;

  DashboardData? dashboard;
  List<ClaimSummary> claims = const [];
  bool busy = false;
  String? error;

  Future<void> loadDashboard() async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      dashboard = await service.dashboard();
    } catch (exception) {
      error = readableApiError(exception);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> loadClaims({String? search, String? status}) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      claims = await service.list(search: search, status: status);
    } catch (exception) {
      error = readableApiError(exception);
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
