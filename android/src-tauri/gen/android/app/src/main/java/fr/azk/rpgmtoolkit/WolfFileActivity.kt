package fr.azk.rpgmtoolkit

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class WolfFileActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if(state==null)startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE);type="application/json";addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) },1)
    }
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request,result,data)
        WolfOverlayService.fileResult(if(result==RESULT_OK)data?.data else null);finish()
    }
    override fun onDestroy() { if(isFinishing)WolfOverlayService.fileResult(null);super.onDestroy() }
}
