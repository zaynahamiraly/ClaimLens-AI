import '../models/user_profile.dart';
import 'api_client.dart';

class AuthService {
  const AuthService(this.client);
  final ApiClient client;

  Future<UserProfile> login(String email, String password) async {
    final response = await client.dio.post<Map<String, dynamic>>('/auth/login', data: {'email': email.trim(), 'password': password});
    final data = response.data!;
    await client.saveSession(data['access_token'] as String, data['refresh_token'] as String);
    return UserProfile.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<UserProfile> profile() async {
    final response = await client.dio.get<Map<String, dynamic>>('/profile');
    return UserProfile.fromJson(response.data!);
  }

  Future<void> logout() async {
    try {
      await client.dio.post<void>('/auth/logout');
    } finally {
      await client.clearSession();
    }
  }
}
