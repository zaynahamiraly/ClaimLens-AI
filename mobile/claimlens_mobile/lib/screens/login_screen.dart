import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  final formKey = GlobalKey<FormState>();
  bool hidden = true;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: formKey,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Icon(Icons.auto_awesome, size: 54, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(height: 16),
                  Text('ClaimLens AI', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text('Sign in to submit and track medical claims.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 32),
                  TextFormField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined)), validator: (value) => value != null && value.contains('@') ? null : 'Enter your email.'),
                  const SizedBox(height: 16),
                  TextFormField(controller: password, obscureText: hidden, decoration: InputDecoration(labelText: 'Password', prefixIcon: const Icon(Icons.lock_outline), suffixIcon: IconButton(onPressed: () => setState(() => hidden = !hidden), icon: Icon(hidden ? Icons.visibility : Icons.visibility_off))), validator: (value) => value == null || value.isEmpty ? 'Enter your password.' : null),
                  if (auth.error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(auth.error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: auth.busy ? null : () { if (formKey.currentState!.validate()) auth.login(email.text, password.text); },
                    icon: auth.busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.login),
                    label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Sign in')),
                  ),
                  const SizedBox(height: 16),
                  const Text('Accounts are created through the existing ClaimLens web registration and administration flow.', textAlign: TextAlign.center),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
