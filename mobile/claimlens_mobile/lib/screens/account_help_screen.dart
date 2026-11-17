import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_client.dart';

enum AccountAction { signup, recovery }

class AccountHelpScreen extends StatefulWidget {
  const AccountHelpScreen(
      {super.key, required this.action, this.initialEmail = ''});
  final AccountAction action;
  final String initialEmail;
  @override
  State<AccountHelpScreen> createState() => _AccountHelpScreenState();
}

class _AccountHelpScreenState extends State<AccountHelpScreen> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController();
  late final email = TextEditingController(text: widget.initialEmail);
  final password = TextEditingController();
  final confirm = TextEditingController();
  final code = TextEditingController();
  bool busy = false, sent = false, complete = false, hidden = true;
  String? error, message;
  bool get signup => widget.action == AccountAction.signup;

  @override
  void dispose() {
    for (final controller in [name, email, password, confirm, code]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final client = context.read<AuthProvider>().client;
      final path = signup
          ? '/auth/signup'
          : sent
              ? '/auth/reset-password'
              : '/auth/forgot-password';
      final response = await client.dio.post<Map<String, dynamic>>(path, data: {
        'email': email.text.trim(),
        if (signup) 'display_name': name.text.trim(),
        if (signup || sent) 'password': password.text,
        if (!signup && sent) 'code': code.text.trim(),
      });
      if (!mounted) return;
      setState(() {
        message = response.data?['message'] as String?;
        if (signup || sent) {
          complete = true;
        } else {
          sent = true;
        }
        password.clear();
        confirm.clear();
      });
    } catch (exception) {
      if (mounted) setState(() => error = readableApiError(exception));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar:
            AppBar(title: Text(signup ? 'Create account' : 'Reset password')),
        body: SafeArea(
            child: Center(
                child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: form,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(signup ? Icons.person_add_alt_1 : Icons.lock_reset,
                          size: 48,
                          color: Theme.of(context).colorScheme.primary),
                      const SizedBox(height: 16),
                      Text(
                          signup ? 'Join ClaimLens AI' : 'Recover your account',
                          style: Theme.of(context).textTheme.headlineSmall,
                          textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      Text(
                          signup
                              ? 'Create a client account to submit and track your claims.'
                              : 'We will email you a verification code to choose a new password.',
                          textAlign: TextAlign.center),
                      const SizedBox(height: 24),
                      if (!complete) ...[
                        if (signup) ...[
                          TextFormField(
                              controller: name,
                              enabled: !busy,
                              textCapitalization: TextCapitalization.words,
                              decoration:
                                  const InputDecoration(labelText: 'Full name'),
                              validator: (v) => (v?.trim().length ?? 0) < 2 ||
                                      (v?.trim().length ?? 0) > 120
                                  ? 'Enter a name between 2 and 120 characters.'
                                  : null),
                          const SizedBox(height: 16),
                        ],
                        TextFormField(
                            controller: email,
                            enabled: !busy && !sent,
                            keyboardType: TextInputType.emailAddress,
                            autocorrect: false,
                            decoration:
                                const InputDecoration(labelText: 'Email'),
                            validator: (v) =>
                                RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                        .hasMatch(v?.trim() ?? '')
                                    ? null
                                    : 'Enter a valid email.'),
                        if (!signup && sent) ...[
                          const SizedBox(height: 16),
                          TextFormField(
                              controller: code,
                              enabled: !busy,
                              keyboardType: TextInputType.number,
                              autofillHints: const [AutofillHints.oneTimeCode],
                              decoration: const InputDecoration(
                                  labelText: 'Email verification code'),
                              validator: (v) => RegExp(r'^\d{6,10}$')
                                      .hasMatch(v?.trim() ?? '')
                                  ? null
                                  : 'Enter the code from your email.'),
                        ],
                        if (signup || sent) ...[
                          const SizedBox(height: 16),
                          TextFormField(
                              controller: password,
                              enabled: !busy,
                              obscureText: hidden,
                              autocorrect: false,
                              enableSuggestions: false,
                              decoration: InputDecoration(
                                  labelText: 'New password',
                                  helperText: 'Use 8 to 128 characters.',
                                  suffixIcon: IconButton(
                                      tooltip: hidden
                                          ? 'Show password'
                                          : 'Hide password',
                                      onPressed: () =>
                                          setState(() => hidden = !hidden),
                                      icon: Icon(hidden
                                          ? Icons.visibility
                                          : Icons.visibility_off))),
                              validator: (v) =>
                                  (v?.length ?? 0) < 8 || (v?.length ?? 0) > 128
                                      ? 'Use 8 to 128 characters.'
                                      : null),
                          const SizedBox(height: 16),
                          TextFormField(
                              controller: confirm,
                              enabled: !busy,
                              obscureText: true,
                              autocorrect: false,
                              enableSuggestions: false,
                              decoration: const InputDecoration(
                                  labelText: 'Confirm password'),
                              validator: (v) => v != password.text
                                  ? 'Passwords do not match.'
                                  : null),
                        ],
                      ],
                      if (message != null)
                        Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(message!, semanticsLabel: message)),
                      if (error != null)
                        Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(error!,
                                style: TextStyle(
                                    color:
                                        Theme.of(context).colorScheme.error))),
                      const SizedBox(height: 24),
                      if (!complete)
                        FilledButton(
                            onPressed: busy ? null : submit,
                            child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: busy
                                    ? const SizedBox.square(
                                        dimension: 20,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : Text(signup
                                        ? 'Create account'
                                        : sent
                                            ? 'Update password'
                                            : 'Send recovery code'))),
                      if (!signup && sent && !complete)
                        TextButton(
                            onPressed: busy
                                ? null
                                : () => setState(() {
                                      sent = false;
                                      message = null;
                                      error = null;
                                      code.clear();
                                    }),
                            child: const Text(
                                'Change email or request another code')),
                      TextButton(
                          onPressed: busy ? null : () => Navigator.pop(context),
                          child: const Text('Back to sign in')),
                    ]),
              )),
        ))),
      );
}
