package com.pulsedrop.client

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  companion object {
    var currentActivity: MainActivity? = null

    @JvmStatic
    fun openFilePath(filePath: String): Boolean {
      val activity = currentActivity ?: return false
      activity.runOnUiThread {
        try {
          val file = File(filePath)
          if (file.exists()) {
            // Index file with MediaScanner so system apps recognize it immediately
            android.media.MediaScannerConnection.scanFile(
              activity,
              arrayOf(file.absolutePath),
              null,
              null
            )

            val uri: Uri = FileProvider.getUriForFile(
              activity,
              "${activity.packageName}.fileprovider",
              file
            )
            val extension = file.extension
            val mimeType = if (extension.isNotEmpty()) {
              MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase()) ?: "*/*"
            } else {
              "*/*"
            }
            val intent = Intent(Intent.ACTION_VIEW).apply {
              setDataAndType(uri, mimeType)
              flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(Intent.createChooser(intent, "Open file with"))
          } else {
            val downloadIntent = Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
              flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(downloadIntent)
          }
        } catch (_: Exception) {
          try {
            val downloadIntent = Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
              flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(downloadIntent)
          } catch (_: Exception) {}
        }
      }
      return true
    }

    @JvmStatic
    fun openFileFolder(filePath: String): Boolean {
      val activity = currentActivity ?: return false
      activity.runOnUiThread {
        try {
          val file = File(filePath)
          if (file.exists()) {
            android.media.MediaScannerConnection.scanFile(
              activity,
              arrayOf(file.absolutePath),
              null,
              null
            )
          }
          val downloadIntent = Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
          activity.startActivity(downloadIntent)
        } catch (_: Exception) {}
      }
      return true
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    currentActivity = this
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onDestroy() {
    if (currentActivity === this) {
      currentActivity = null
    }
    super.onDestroy()
  }
}
