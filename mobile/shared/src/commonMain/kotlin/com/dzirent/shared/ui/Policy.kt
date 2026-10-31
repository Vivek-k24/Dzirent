package com.dzirent.shared.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dzirent.shared.model.AccessoryTypes
import com.dzirent.shared.model.Categories

/** Single source of truth for Dzirent's "we only connect people" policy wording. */
object DzirentPolicy {
    const val TITLE = "How Dzirent works"

    const val FULL_TEXT =
        "Dzirent connects people who want to rent clothes. We don't handle payments, hold deposits, " +
            "verify items or guarantee rentals. Agree on price, dates, condition and any deposit in chat " +
            "before you meet. Meet in a public place and never send money before you see the item. " +
            "For valuable pieces, we recommend lenders ask for a refundable deposit."

    const val COMMUNITY_TITLE = "Community policy"

    const val COMMUNITY_RULES =
        "Be honest and respectful. List only pieces you own, show them as they are, and keep " +
            "chats friendly. Harassment, scams and fake listings aren't allowed. Use Report on a " +
            "listing, a person or a message, and Block to stop someone contacting you."

    const val PROHIBITED_TITLE = "What can't be listed"

    val ITEM_RULES: String =
        "Dzirent is for fashion and occasionwear.\n" +
            "Allowed accessories: sunglasses, handbags, ties, non-smart watches, belt buckles, costume jewelry.\n" +
            "Not allowed: smartwatches, caps, hats, boots, shoes, socks, pantyhose.\n" +
            "Not offered: everyday basics such as T-shirts, track pants, sweatpants, joggers, shorts, jean shorts, and plain everyday jeans."

    val PROHIBITED_ITEMS: String =
        ITEM_RULES + "\nUse \"Report listing\" with the reason \"Prohibited item\" if you see one."

    /** Shown above "Message Lender". */
    const val LISTING_NOTICE =
        "Dzirent only connects people. Agree on price, dates, condition and any deposit in chat before you meet."

    /** Shown once per conversation in chat. */
    const val CHAT_SAFETY_TIP =
        "Safety tip: meet in a public place and never send money before you see the item. " +
            "We recommend washing anything worn against the skin before wearing."

    const val SIGN_UP_CONSENT = "I understand Dzirent only connects people"
}

@Composable
fun PolicyNotice(
    text: String,
    modifier: Modifier = Modifier,
    onDismiss: (() -> Unit)? = null
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(
                start = 12.dp,
                top = 12.dp,
                bottom = 12.dp,
                end = if (onDismiss == null) 12.dp else 0.dp
            ),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            if (onDismiss != null) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Dismiss")
                }
            }
        }
    }
}

@Composable
fun HowDzirentWorksDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.Shield, contentDescription = null) },
        title = { Text(DzirentPolicy.TITLE) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    text = DzirentPolicy.FULL_TEXT,
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = DzirentPolicy.PROHIBITED_TITLE,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = DzirentPolicy.PROHIBITED_ITEMS,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Got it") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HowDzirentWorksScreen(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(DzirentPolicy.TITLE) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            Text(text = DzirentPolicy.FULL_TEXT, style = MaterialTheme.typography.bodyLarge)
            Spacer(modifier = Modifier.height(20.dp))
            Text(text = DzirentPolicy.PROHIBITED_TITLE, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = DzirentPolicy.PROHIBITED_ITEMS, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityPolicyScreen(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(DzirentPolicy.COMMUNITY_TITLE) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            Text(text = DzirentPolicy.COMMUNITY_RULES, style = MaterialTheme.typography.bodyLarge)
            Spacer(modifier = Modifier.height(20.dp))
            Text(text = DzirentPolicy.PROHIBITED_TITLE, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = DzirentPolicy.PROHIBITED_ITEMS, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

