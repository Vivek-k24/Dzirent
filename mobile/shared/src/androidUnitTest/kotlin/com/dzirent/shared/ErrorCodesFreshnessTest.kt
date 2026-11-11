package com.dzirent.shared

import com.dzirent.shared.util.ErrorCodes
import com.dzirent.shared.util.ErrorKind
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * C1: the committed ErrorCodes.kt matches contracts/error-codes.json. If this fails, run
 * `node contracts/generate.mjs` from the repo root (the Android build does it when Node is there).
 */
class ErrorCodesFreshnessTest {
    private fun catalogFile(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "contracts/error-codes.json")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("contracts/error-codes.json not found above ${File("").absolutePath}")
    }

    @Test
    fun generatedKotlinMatchesTheCatalog() {
        val codes = Json.parseToJsonElement(catalogFile().readText()).jsonObject["codes"]!!.jsonArray
        val expected = codes.map { element ->
            val e = element.jsonObject
            listOf(
                e["code"]!!.jsonPrimitive.content,
                if (e["kind"]!!.jsonPrimitive.content == "error") ErrorKind.ERROR else ErrorKind.WARNING,
                e["area"]!!.jsonPrimitive.content,
                e["message"]!!.jsonPrimitive.content,
                e["field"]?.jsonPrimitive?.content,
                e["status"]!!.jsonPrimitive.int,
                e["server_detail"]?.jsonPrimitive?.boolean ?: false
            )
        }
        val actual = ErrorCodes.all.map { listOf(it.code, it.kind, it.area, it.message, it.field, it.status, it.serverDetail) }
        assertEquals("ErrorCodes.kt is out of date: run node contracts/generate.mjs", expected, actual)
    }
}
