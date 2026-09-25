import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'providers/auth_provider.dart';
import 'providers/claims_provider.dart';
import 'screens/app_shell.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_client.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final client = ApiClient();
  runApp(ClaimLensApp(client: client));
}

class ClaimLensApp extends StatelessWidget {
  const ClaimLensApp({super.key, required this.client});
  final ApiClient client;

  @override
  Widget build(BuildContext context) => MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider(client)..initialise()),
          ChangeNotifierProvider(create: (_) => ClaimsProvider(client)),
        ],
        child: MaterialApp(
          title: 'ClaimLens AI',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff087f8c), brightness: Brightness.light),
            useMaterial3: true,
            scaffoldBackgroundColor: const Color(0xfff5f7fa),
            inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(), filled: true, fillColor: Colors.white),
          ),
          home: const AuthGate(),
        ),
      );
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.initialising) {
      return const SplashScreen();
    }
    return auth.authenticated ? const AppShell() : const LoginScreen();
  }
}
