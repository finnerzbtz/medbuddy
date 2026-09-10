import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function shareExport(text: string, name: string) {
  const path = 'exports/' + name;
  const saved = await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: text,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({
      title: 'Reminduh export',
      files: [saved.uri],
      dialogTitle: 'Save or share your file',
    });
  } catch (error) {
    // Dismissing the system sheet is a normal user choice.
    if (!/cancel|dismiss/i.test(error instanceof Error ? error.message : String(error)))
      throw error;
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  }
}
