export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = event => {
      resolve(String(event.target?.result || ''))
    }

    reader.onerror = () => {
      reject(reader.error || new Error('读取文件失败'))
    }

    reader.readAsText(file)
  })
}
