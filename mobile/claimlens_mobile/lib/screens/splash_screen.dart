import 'package:flutter/material.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.auto_awesome, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 18),
            Text('ClaimLens AI', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 18),
            const CircularProgressIndicator(),
            const SizedBox(height: 12),
            const Text('Restoring your secure session…'),
          ]),
        ),
      );
}
