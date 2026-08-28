import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "question-factory-assets";
const objectPath = `trust-boundary/smoke-${Date.now()}.svg`;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const svg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>'
);
let uploaded = false;

try {
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, svg, {
    contentType: "image/svg+xml",
    cacheControl: "60",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  uploaded = true;

  const publicObjectUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  const publicResponse = await fetch(publicObjectUrl, { redirect: "manual" });
  if (publicResponse.ok) {
    throw new Error("Private staging object was unexpectedly readable through the public endpoint");
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, 60);
  if (signedError || !signedData?.signedUrl) {
    throw signedError ?? new Error("Signed URL was not created");
  }

  const signedResponse = await fetch(signedData.signedUrl);
  const signedBody = new Uint8Array(await signedResponse.arrayBuffer());
  if (!signedResponse.ok || signedBody.byteLength !== svg.byteLength) {
    throw new Error("Signed preview did not return the uploaded object exactly");
  }

  const { error: disallowedMimeError } = await supabase.storage
    .from(BUCKET)
    .upload(`trust-boundary/mime-must-fail-${Date.now()}.png`, new Uint8Array([0]), {
      contentType: "image/png",
      upsert: false,
    });
  if (!disallowedMimeError) {
    throw new Error("Bucket unexpectedly accepted image/png");
  }

  console.log(
    JSON.stringify({
      bucket: BUCKET,
      serviceUpload: "passed",
      unsignedPublicRead: `blocked:${publicResponse.status}`,
      signedPreview: "passed",
      disallowedMime: "blocked",
      cleanup: "pending",
    })
  );
} finally {
  if (uploaded) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([objectPath]);
    if (removeError) throw removeError;
  }
}

const { data: remaining, error: listError } = await supabase.storage
  .from(BUCKET)
  .list("trust-boundary", { search: objectPath.split("/").at(-1), limit: 10 });
if (listError) throw listError;
if (remaining && remaining.length > 0) {
  throw new Error("Smoke-test object still exists after cleanup");
}

console.log(JSON.stringify({ bucket: BUCKET, cleanup: "passed" }));
