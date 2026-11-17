# ClaimLens AI Flutter client

This directory contains the mobile frontend for ClaimLens AI. It is a real API client: no user, claim, dashboard, or OCR result is hardcoded. It talks only to the FastAPI gateway in `services/api`, which authenticates with Supabase and performs document processing on the server.

## Screen flow

```text
Splash -> Login -> Dashboard / Claims / Profile
                       |
                       +-> New claim
                           -> camera/gallery/files
                           -> server OCR processing
                           -> editable extracted values + confidence
                           -> package total review
                           -> transactional submission
                           -> claim details and audit history
```

Clients can create and confirm claims. Staff accounts receive the operational dashboard and claim history but do not see the client-only New Claim action. Database RLS remains the final access boundary.

## First-time platform generation

Flutter was not installed in the implementation environment, so the checked-in Dart application is complete but generated Android/iOS runner folders must be created once on a machine with Flutter:

```powershell
Set-Location mobile\claimlens_mobile
flutter create --platforms=android,ios --org ai.claimlens .
flutter pub get
```

`flutter create` generates the native runner projects; `flutter pub get` downloads the declared Dart packages. Keep the existing `lib`, `test`, and `pubspec.yaml` files if Flutter asks about conflicts.

For a physical Android device connected by USB, forward the development API port:

```powershell
adb reverse tcp:8000 tcp:8000
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:8000/api/v1
```

The first command lets the phone reach the PC's port 8000; the second launches the app with the local API URL. For the Android emulator, use the default `http://10.0.2.2:8000/api/v1`. Production builds must use an HTTPS API URL:

```powershell
flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

## Quality commands

```powershell
flutter analyze
flutter test
```

These commands check Dart/Flutter static correctness and run the model test. They must be run after installing Flutter and generating the native projects.

## Packages

- `dio`: REST requests, token interceptor, and multipart uploads;
- `provider`: simple explainable state management;
- `flutter_secure_storage`: encrypted token persistence;
- `image_picker`: camera and image gallery;
- `file_picker`: PDF, DOCX, and image file selection;
- `intl`: local date presentation.
- `url_launcher`: opens short-lived private source-document links.

No Supabase secret key or OCR credential belongs in this mobile project.


## Mobile registration and password recovery

Sign in now links to native Create account and Reset password screens. The API
provides `/auth/signup`, `/auth/forgot-password`, and `/auth/reset-password`.
Registration always creates a client profile through the existing database trigger.
Users confirm their signup email before signing in if confirmation is enabled.

Before using code-based recovery, open Supabase Authentication > Email Templates >
Reset Password and include `{{ .Token }}` in the email body, for example:

```html
<h2>Reset your ClaimLens password</h2>
<p>Enter this code in the ClaimLens mobile app:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this, ignore this email.</p>
```

Configure Supabase SMTP for delivery to real users. The app never exposes a
service-role key and only updates a password after Supabase verifies a recovery
code. Code verification is enforced by Supabase, including expiry and rate limits.
An expired code can be replaced using the request-another-code action. Email
delivery and a real-account recovery must be checked with a test account before
release; local tests use mocked Supabase responses and send no emails.
