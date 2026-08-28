import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { validateFactoryAssetBytes } from "../src/lib/questionFactory/assetValidation.ts";

const EXPECTED_PROJECT_REF = "wmndxiuqzrnqbhrznmfg";
const BUCKET = "question-factory-assets";
const PREFIX = "trust-boundary";
const BUCKET_LIMIT_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const testUserAccessToken = process.env.QUESTION_FACTORY_TEST_USER_ACCESS_TOKEN;

if (!supabaseUrl || !serviceRoleKey || !publicKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
if (projectRef !== EXPECTED_PROJECT_REF) {
  throw new Error(`Refusing to run against unexpected Supabase project: ${projectRef}`);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(supabaseUrl, serviceRoleKey, clientOptions);
const anonymous = createClient(supabaseUrl, publicKey, clientOptions);
const authenticated = testUserAccessToken
  ? createClient(supabaseUrl, publicKey, {
      ...clientOptions,
      global: { headers: { Authorization: `Bearer ${testUserAccessToken}` } },
    })
  : null;

if (authenticated) {
  const { data, error } = await authenticated.auth.getUser(testUserAccessToken);
  if (error || !data.user || data.user.is_anonymous) {
    throw new Error("QUESTION_FACTORY_TEST_USER_ACCESS_TOKEN is not a valid ordinary user token");
  }
}

const runId = `${Date.now()}-${randomUUID()}`;
const objectPath = `${PREFIX}/smoke-${runId}.svg`;
const mimePath = `${PREFIX}/mime-must-fail-${runId}.png`;
const oversizePath = `${PREFIX}/oversize-must-fail-${runId}.svg`;
const cleanupPaths = new Set([objectPath, mimePath, oversizePath]);
const svg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'
);
const validatedUpload = validateFactoryAssetBytes({
  bytes: svg, mimeType: "image/svg+xml", fileName: objectPath,
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = {
  schemaVersion: 1,
  projectRef,
  bucket: BUCKET,
  runId,
  startedAt: new Date().toISOString(),
  results: {},
};

function requireBlocked(error, label) {
  if (!error) throw new Error(`${label} unexpectedly succeeded`);
  return `blocked:${error.statusCode ?? error.status ?? "error"}`;
}

async function assertNotPresent(path) {
  const fileName = path.split("/").at(-1);
  const { data, error } = await service.storage.from(BUCKET).list(PREFIX, {
    search: fileName,
    limit: 10,
  });
  if (error) throw error;
  if (data?.some((item) => item.name === fileName)) {
    throw new Error(`Unexpected smoke-test object remains: ${path}`);
  }
}

async function verifyRestrictedActor(client, actor) {
  const actorPath = `${PREFIX}/${actor}-upload-must-fail-${runId}.svg`;
  cleanupPaths.add(actorPath);
  const replacement = new TextEncoder().encode("must-not-replace");
  const { error: uploadError } = await client.storage.from(BUCKET).upload(actorPath, svg, {
    contentType: "image/svg+xml",
    upsert: false,
  });
  const { error: overwriteError } = await client.storage
    .from(BUCKET)
    .upload(objectPath, replacement, { contentType: "image/svg+xml", upsert: true });
  const { error: downloadError } = await client.storage.from(BUCKET).download(objectPath);
  const { error: signError } = await client.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  const { error: deleteError } = await client.storage.from(BUCKET).remove([objectPath]);
  const { data: preservedObject, error: preservedObjectError } = await service.storage
    .from(BUCKET)
    .download(objectPath);
  if (preservedObjectError || !preservedObject) {
    throw preservedObjectError ?? new Error(`${actor} delete removed the protected object`);
  }
  const preservedBytes = new Uint8Array(await preservedObject.arrayBuffer());
  if (sha256(preservedBytes) !== sha256(svg)) {
    throw new Error(`${actor} operation changed the protected object`);
  }

  return {
    upload: requireBlocked(uploadError, `${actor} upload`),
    overwrite: requireBlocked(overwriteError, `${actor} overwrite`),
    privateDownload: requireBlocked(downloadError, `${actor} private download`),
    signedUrl: requireBlocked(signError, `${actor} signed URL`),
    delete: deleteError ? `blocked:${deleteError.statusCode ?? deleteError.status ?? "error"}` : "blocked:no-effect",
  };
}

let primaryError;
try {
  const { error: uploadError } = await service.storage.from(BUCKET).upload(objectPath, svg, {
    contentType: "image/svg+xml",
    cacheControl: "60",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  evidence.results.serviceUpload = "passed";

  const objectName = objectPath.split("/").at(-1);
  const { data: listed, error: listError } = await service.storage.from(BUCKET).list(PREFIX, {
    search: objectName,
    limit: 10,
  });
  if (listError) throw listError;
  const uploadedObject = listed?.find((item) => item.name === objectName);
  if (
    !uploadedObject ||
    uploadedObject.metadata?.size !== validatedUpload.byteSize ||
    uploadedObject.metadata?.mimetype !== "image/svg+xml"
  ) {
    throw new Error("Uploaded object metadata does not match the expected size and MIME type");
  }
  evidence.results.objectMetadata = "passed:size-and-mime";

  const publicObjectUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  const publicResponse = await fetch(publicObjectUrl, { redirect: "manual" });
  if (publicResponse.ok) {
    throw new Error("Private staging object was readable through the public endpoint");
  }
  evidence.results.unsignedPublicRead = `blocked:${publicResponse.status}`;

  const { data: signedData, error: signedError } = await service.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signedData?.signedUrl) {
    throw signedError ?? new Error("Signed URL was not created");
  }
  const signedResponse = await fetch(signedData.signedUrl, { redirect: "error" });
  const signedBody = new Uint8Array(await signedResponse.arrayBuffer());
  const validatedDownload = validateFactoryAssetBytes({
    bytes: signedBody, mimeType: "image/svg+xml", fileName: objectPath,
  });
  if (!signedResponse.ok || validatedDownload.checksum !== validatedUpload.checksum) {
    throw new Error("Signed preview did not return the exact uploaded object");
  }
  evidence.results.signedPreview = "passed:content-validation-and-sha256";

  evidence.results.anonymous = await verifyRestrictedActor(anonymous, "anonymous");
  evidence.results.authenticated = authenticated
    ? await verifyRestrictedActor(authenticated, "authenticated")
    : "skipped:no-test-user-token";

  const { error: disallowedMimeError } = await service.storage
    .from(BUCKET)
    .upload(mimePath, new Uint8Array([0]), { contentType: "image/png", upsert: false });
  evidence.results.disallowedMime = requireBlocked(disallowedMimeError, "image/png upload");

  const oversize = new Uint8Array(BUCKET_LIMIT_BYTES + 1);
  const { error: oversizeError } = await service.storage
    .from(BUCKET)
    .upload(oversizePath, oversize, { contentType: "image/svg+xml", upsert: false });
  evidence.results.oversizeUpload = requireBlocked(oversizeError, "oversize upload");
} catch (error) {
  primaryError = error;
  evidence.results.failure = error instanceof Error ? error.message : String(error);
} finally {
  const { error: cleanupError } = await service.storage.from(BUCKET).remove([...cleanupPaths]);
  if (cleanupError) {
    evidence.results.cleanup = `failed:${cleanupError.message}`;
    primaryError ??= cleanupError;
  } else {
    try {
      for (const path of cleanupPaths) await assertNotPresent(path);
      evidence.results.cleanup = "passed";
    } catch (error) {
      evidence.results.cleanup = `failed:${error instanceof Error ? error.message : String(error)}`;
      primaryError ??= error;
    }
  }
}

evidence.finishedAt = new Date().toISOString();
evidence.status = primaryError ? "failed" : "passed";
console.log(JSON.stringify(evidence));

if (primaryError) throw primaryError;
