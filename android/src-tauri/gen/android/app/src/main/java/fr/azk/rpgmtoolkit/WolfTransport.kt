package fr.azk.rpgmtoolkit

import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

class WolfTransport(private val storage: WolfStorage, private val folder: DocumentFile, private val textFields: BooleanArray) {
    private var counter = 1
    private var pending = 0
    private var pendingOperations: JSONArray? = null
    private var pendingMutating = false
    init {
        DocumentQueries.refresh()
        val previous=folder.toolkitChild("ack.txt")?.let { storage.read(it,65536).toString(Charsets.UTF_8).removePrefix("\uFEFF").trim().toIntOrNull() } ?: 0
        counter=(previous.coerceIn(0,999998)+1)
    }
    private fun text(name: String, limit: Int = 65536): String? = folder.toolkitChild(name)?.let { storage.read(it,limit).toString(Charsets.UTF_8).removePrefix("\uFEFF").replace("\r\n","\n") }
    private fun integer(value: JSONObject, key: String): Int {
        val number=value.get(key)
        require(number is Number && number.toDouble().isFinite() && number.toDouble()==number.toLong().toDouble() && number.toLong() in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) { "Entier WOLF invalide : $key" }
        return number.toInt()
    }
    fun exchange(operations: JSONArray): JSONObject {
        val result=exchangeOnce(operations)
        if(operations.length()==1 && operations.getJSONObject(0).getInt("action")==8 && result.getJSONArray("results").getJSONObject(0).getInt("error")==0) {
            Thread.sleep(100)
            val end=android.os.SystemClock.elapsedRealtime()+3000
            while(android.os.SystemClock.elapsedRealtime()<end) {
                val status=exchangeOnce(JSONArray().put(JSONObject().put("index",-1).put("action",7)))
                if(status.getJSONArray("results").getJSONObject(0).getInt("value")==0) return status.put("loadComplete",true).put("mutating",true)
                Thread.sleep(100)
            }
            val cancelled=exchangeOnce(JSONArray().put(JSONObject().put("index",-1).put("action",9)))
            error(if(cancelled.getJSONArray("results").getJSONObject(0).getInt("value")==0) "Chargement annulé : un événement du jeu est en cours." else "Chargement non confirmé. Actualisez avant de poursuivre.")
        }
        return result
    }
    private fun exchangeOnce(operations: JSONArray): JSONObject {
        DocumentQueries.refresh()
        require(operations.length() in 1..128) { "1 à 128 opérations maximum." }
        for(i in 0 until operations.length()) {
            val op=operations.getJSONObject(i);val index=integer(op,"index");val action=integer(op,"action")
            require(op.keys().asSequence().all { it in setOf("index","action","value") })
            if(index==-1)require(action in setOf(0,5,6,7,8,9)) { "Commande WOLF invalide." }
            else {
                require(index in textFields.indices && action in 0..4) { "Champ WOLF invalide." }
                val string=textFields[index]
                require(!(action==1 && string) && !(action==2 && !string)) { "Type WOLF incorrect." }
            }
            if(action==2)require(op.getString("value").length<=10000 && !op.getString("value").contains('\u0000')) { "Texte trop long ou invalide." }
            else if(action==1) { val value=op.get("value");require(value is Number && value.toDouble().isFinite() && value.toDouble()==value.toLong().toDouble() && value.toLong() in -2000000000L..2000000000L) { "Entier WOLF invalide." } }
            if(action==5)require(integer(op,"value") in 0..1)
            if(action==8) {
                require(operations.length()==1 && Regex("toolkit-save-[0-9]{1,6}\\.sav").matches(op.getString("value"))) { "Sauvegarde Toolkit invalide." }
                val save=folder.toolkitChild(op.getString("value"));require(save?.isFile==true && save.length()>0) { "Sauvegarde Toolkit absente." }
            }
        }
        if(pending!=0) {
            val ack=text("ack.txt")?.trim()?.toIntOrNull()
            require(ack==pending) { "Résultat en attente. Reprenez le jeu dans Winlator, puis actualisez." }
            response(pending,pendingOperations!!,pendingMutating);pending=0;pendingOperations=null
        }
        val id=counter;counter=if(counter==999999)1 else counter+1
        val mutating=(0 until operations.length()).any { operations.getJSONObject(it).getInt("action") !in setOf(0,7) }
        val body=buildString {
            for(i in 0 until operations.length()) {
                val op=operations.getJSONObject(i);val action=op.getInt("action")
                append(op.getInt("index")).append('\n').append(action).append('\n').append(if(action in setOf(1,5))op.getInt("value") else 0).append('\n')
                if(action in setOf(2,8))storage.write(folder,"input-$i.txt",op.getString("value").toByteArray(Charsets.UTF_8))
            }
        }
        storage.write(folder,"commands.txt",body.toByteArray(Charsets.US_ASCII))
        pending=id;pendingOperations=operations;pendingMutating=mutating
        storage.write(folder,"request.txt",id.toString().toByteArray(Charsets.US_ASCII))
        val end=android.os.SystemClock.elapsedRealtime()+10000
        while(android.os.SystemClock.elapsedRealtime()<end && !Thread.currentThread().isInterrupted) {
            DocumentQueries.refresh()
            if(text("ack.txt")?.trim()?.toIntOrNull()==id) {
                val result=response(id,operations,mutating);pending=0;pendingOperations=null;return result
            }
            Thread.sleep(40)
        }
        error(if(mutating)"Résultat indéterminé. Reprenez le jeu dans Winlator, puis actualisez." else "WOLF ne répond pas. Lancez la partie et vérifiez son exécution en arrière-plan.")
    }
    private fun response(id: Int, operations: JSONArray, mutating: Boolean): JSONObject {
        val reply=JSONObject(text("reply.txt",1024*1024) ?: error("Réponse WOLF absente."))
        require(reply.getInt("request")==id) { "Réponse WOLF périmée." }
        val results=reply.getJSONArray("results");require(results.length()==operations.length()) { "Réponse WOLF incomplète." }
        for(i in 0 until results.length()) {
            val result=results.getJSONObject(i);val op=operations.getJSONObject(i)
            require(result.getInt("index")==op.getInt("index") && result.getInt("frozen") in 0..1 && result.getInt("error") in 0..3) { "Réponse WOLF incorrecte." }
            if(result.optBoolean("string",false)) {
                val value=text("output-$i.txt",65536) ?: error("Texte WOLF absent.")
                result.put("value",value)
            } else { require(result.get("value") is Number) { "Valeur WOLF invalide." } }
            if(op.getInt("action")==6 && result.getInt("error")==0) {
                val file=folder.toolkitChild("toolkit-save-$id.sav") ?: error("Sauvegarde WOLF absente.")
                require(file.isFile && file.length()>0) { "Sauvegarde WOLF vide." };reply.put("saveFile",file.name)
            }
        }
        reply.put("mutating",mutating);return reply
    }
}
