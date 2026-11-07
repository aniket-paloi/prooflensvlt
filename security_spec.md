# ProofLens Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched (`/{document=**}`) deny all reads and writes (`allow read, write: if false;`).
2. **Verified Identity Mandate**: All write operations require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **PII Split Collection Isolation**: User email addresses are isolated in `/users/{userId}/private/{infoId}` and can only be read or created by the exact owner (`request.auth.uid == userId`) after parent `/users/{userId}` exists (`exists(/databases/$(database)/documents/users/$(userId))`).
4. **Strict Key & Size Bounds**: Every `create` and `update` wraps `isValid[Entity](incoming())` enforcing `hasAll` and `hasOnly` key allowlists, string `.size()` bounds, regex patterns (`^[a-zA-Z0-9_\-]+$`), and server timestamp equality (`request.time`).
5. **Immutable Ownership & Creation Timestamps**: `uid`, `id`, `ownerId`, `sha256`, and `createdAt` can never be mutated during an `update`.
6. **Query Enforcer on List Operations**: `allow list` on `/folders/{folderId}` and `/vaultDocuments/{documentId}` enforces `resource.data.ownerId == request.auth.uid` without any `get()` or `exists()` calls inside `list`.

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity, and State)
1. **Payload 1 (Identity Spoofing on User Create)**: Authenticated as `user_A`, attempting to create `/users/user_B` with `uid: "user_B"`. -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Write)**: Authenticated as `user_A` with `email_verified: false`, attempting to create `/folders/fld_1`. -> `PERMISSION_DENIED`.
3. **Payload 3 (Shadow Field Injection on Folder Create)**: Creating `/folders/fld_1` with required fields plus ghost field `"isAdmin": true`. -> `PERMISSION_DENIED`.
4. **Payload 4 (PII Cross-User Read)**: Authenticated as `user_B`, attempting `get` on `/users/user_A/private/info`. -> `PERMISSION_DENIED`.
5. **Payload 5 (Orphaned Subcollection Write)**: Attempting to create `/users/user_A/private/info` when parent `/users/user_A` does not exist. -> `PERMISSION_DENIED`.
6. **Payload 6 (Path ID Poisoning)**: Attempting to create `/folders/invalid$id!@#` with non-matching path characters. -> `PERMISSION_DENIED`.
7. **Payload 7 (Value Poisoning on Update)**: Updating `/folders/fld_1` with `name` exceeding 80 characters (e.g., 500-char string). -> `PERMISSION_DENIED`.
8. **Payload 8 (Owner Mutation on Update)**: Updating `/folders/fld_1` to change `ownerId` from `user_A` to `user_B`. -> `PERMISSION_DENIED`.
9. **Payload 9 (Timestamp Forgery on Create)**: Creating `/folders/fld_1` with a past or future `createdAt` timestamp not equal to `request.time`. -> `PERMISSION_DENIED`.
10. **Payload 10 (Immortal Field Mutation on Update)**: Updating `/vaultDocuments/doc_1` while mutating `createdAt` or `sha256`. -> `PERMISSION_DENIED`.
11. **Payload 11 (Unauthorized List Scraping)**: Listing `/folders` without filtering `ownerId == request.auth.uid`. -> `PERMISSION_DENIED`.
12. **Payload 12 (Invalid Enum Injection)**: Creating `/vaultDocuments/doc_1` with `docClass: "malicious-type"`. -> `PERMISSION_DENIED`.
