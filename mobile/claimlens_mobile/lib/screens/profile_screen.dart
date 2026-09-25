import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user!;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [CircleAvatar(radius: 34, child: Text(user.displayName.substring(0, 1).toUpperCase(), style: const TextStyle(fontSize: 28))), const SizedBox(height: 12), Text(user.displayName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)), if (user.email != null) Text(user.email!), const SizedBox(height: 8), Chip(label: Text(user.role.replaceAll('_', ' ').toUpperCase()))]))),
        const SizedBox(height: 16),
        const Card(child: ListTile(leading: Icon(Icons.security), title: Text('Secure session'), subtitle: Text('Authentication tokens are encrypted in device secure storage.'))),
        const SizedBox(height: 16),
        OutlinedButton.icon(onPressed: auth.busy ? null : auth.logout, icon: const Icon(Icons.logout), label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Sign out'))),
      ]),
    );
  }
}
