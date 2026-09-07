export async function deleteCompanyBatches(
  ids: string[],
  request: (ids: string[]) => Promise<unknown>,
  onProgress: (processed: number) => void,
) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    await request(ids.slice(offset, offset + 100));
    onProgress(Math.min(offset + 100, ids.length));
  }
}
