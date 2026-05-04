# Security Specification for GreenSeekho

## 1. Data Invariants
- A `User` profile can only be created by the authenticated user themselves.
- A `PlantRecord` must be owned by a registered user.
- A `Folder` must be owned by a registered user.
- Users can only read, update, or delete their own data.
- Public reads are NOT allowed for any sensitive data.

## 2. The Dirty Dozen Payloads (Rejection Targets)
1. Creating a user profile for a different UID.
2. Updating someone else's plant analysis.
3. Reading all plant records without being signed in.
4. Injecting a 2MB string into a scientific name.
5. Deleting a research folder owned by another student.
6. Creating a plant record with an invalid ID format.
7. Modifying `createdAt` during an update.
8. Listing folders of another user.
9. Adding a user to the `admins` collection manually from the client.
10. Creating a plant record without a userId field matching the auth token.
11. Updating a folder name to an empty string.
12. Creating a user profile with `email_verified: true` when it's not verified (though we check token).

## 3. Test Runner (Draft)
A `firestore.rules.test.ts` would verify these constraints using the Firebase Rules Emulator.
