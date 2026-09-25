class UserProfile {
  const UserProfile({
    required this.id,
    required this.displayName,
    required this.role,
    required this.status,
    this.email,
  });

  final String id;
  final String displayName;
  final String role;
  final String status;
  final String? email;

  bool get isClient => role == 'client';

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String,
        displayName: json['display_name'] as String,
        role: json['role'] as String,
        status: json['status'] as String,
        email: json['email'] as String?,
      );
}
