# G108 — In-App Purchases & Platform Monetization

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G82 Backend Services & Cloud Saves](./G82_backend_services_cloud_saves_achievements.md) · [G42 Platform Integration & Steamworks](./G42_platform_integration_and_steamworks.md) · [G11 Save & Load Systems](./G11_save_load_systems.md)

Mobile games and free-to-play titles need in-app purchases (IAP). Godot does not include IAP in its core engine — instead, platform-specific plugins handle billing. This guide covers the architecture of IAP in Godot 4.4+, Android billing with the first-party GodotGooglePlayBilling plugin, iOS billing with StoreKit plugins, cross-platform abstractions, receipt validation, and common monetization patterns.

**Important:** IAP plugins are native platform extensions. They only work in exported builds on real devices or emulators — not in the Godot editor.

---

## Table of Contents

1. [IAP Architecture Overview](#1-iap-architecture-overview)
2. [Product Types](#2-product-types)
3. [Android — GodotGooglePlayBilling](#3-android--godotgoogleplaybilling)
4. [iOS — StoreKit Plugin](#4-ios--storekit-plugin)
5. [Cross-Platform Abstraction Layer](#5-cross-platform-abstraction-layer)
6. [Receipt Validation](#6-receipt-validation)
7. [Restoring Purchases](#7-restoring-purchases)
8. [Monetization Patterns for Games](#8-monetization-patterns-for-games)
9. [Testing IAP](#9-testing-iap)
10. [Common Mistakes](#10-common-mistakes)

---

## 1. IAP Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  Your Game (GDScript / C#)                       │
│  ┌────────────────────────────────────────────┐  │
│  │  IAPManager (Autoload)                     │  │
│  │  - purchase(product_id)                    │  │
│  │  - query_products()                        │  │
│  │  - restore_purchases()                     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│  ┌──────────────▼─────────────────────────────┐  │
│  │  Platform Plugin (native)                  │  │
│  │  Android: GodotGooglePlayBilling           │  │
│  │  iOS: StoreKit plugin                      │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
└─────────────────┼─────────────────────────────────┘
                  │
    ┌─────────────▼─────────────────┐
    │  Platform Store               │
    │  Google Play / App Store      │
    │  - Product catalog            │
    │  - Payment processing         │
    │  - Receipt generation         │
    └───────────────────────────────┘
```

Key principles:

- **Plugins are loaded at runtime.** Check if the plugin exists before calling it — your game should handle missing plugins gracefully (e.g., on desktop builds).
- **All billing operations are asynchronous.** You call a method and receive the result via a signal/callback.
- **Products are defined in the store console** (Google Play Console or App Store Connect), not in Godot. Your code references products by their string ID.

---

## 2. Product Types

| Type | Store Term | Behavior | Examples |
|------|-----------|----------|----------|
| **Consumable** | Managed (consumable) | Can be purchased multiple times. Must be "consumed" after purchase to allow repurchase. | Gems, coins, extra lives |
| **Non-consumable** | Managed (non-consumable) | Purchased once. Permanent unlock. | Remove ads, level packs, cosmetics |
| **Subscription** | Subscription | Recurring billing. Has a lifecycle (active, grace period, expired). | Premium pass, season pass |

---

## 3. Android — GodotGooglePlayBilling

The first-party `GodotGooglePlayBilling` plugin wraps Google Play Billing Library and ships as an Android plugin for Godot 4.2+.

### Setup

1. Download the plugin from the Godot Asset Library or the [official repository](https://github.com/godotengine/godot-google-play-billing).
2. Copy the plugin files into `addons/GodotGooglePlayBilling/` in your project.
3. In **Project → Export → Android**, enable the `GodotGooglePlayBilling` plugin.
4. Add products in Google Play Console under **Monetize → Products → In-app products**.

### GDScript — Initialization and Purchase

```gdscript
extends Node

## Autoload: IAPManager

signal purchase_completed(product_id: String)
signal purchase_failed(product_id: String, error: String)

var _billing: Object = null  # The plugin object
var _product_details: Dictionary[String, Dictionary] = {}

func _ready() -> void:
    if Engine.has_singleton("GodotGooglePlayBilling"):
        _billing = Engine.get_singleton("GodotGooglePlayBilling")

        # Connect signals
        _billing.connected.connect(_on_connected)
        _billing.disconnected.connect(_on_disconnected)
        _billing.connect_error.connect(_on_connect_error)
        _billing.product_details_query_completed.connect(_on_product_details)
        _billing.purchase_updated.connect(_on_purchase_updated)
        _billing.purchase_error.connect(_on_purchase_error)
        _billing.purchase_consumed.connect(_on_purchase_consumed)
        _billing.purchase_consumption_error.connect(_on_consumption_error)

        # Start connection
        _billing.startConnection()
    else:
        print("Google Play Billing not available on this platform")


func _on_connected() -> void:
    print("Billing connected")
    # Query your product IDs
    _billing.queryProductDetails(
        ["gems_100", "gems_500", "remove_ads"],  # product IDs
        "inapp"  # "inapp" or "subs"
    )


func _on_product_details(details: Array) -> void:
    for detail in details:
        _product_details[detail["productId"]] = detail
        print("Product: %s — %s" % [detail["productId"], detail["price"]])


func purchase(product_id: String) -> void:
    if _billing == null:
        purchase_failed.emit(product_id, "Billing not available")
        return

    if product_id not in _product_details:
        purchase_failed.emit(product_id, "Product not found")
        return

    var response: int = _billing.purchase(product_id)
    if response != OK:
        purchase_failed.emit(product_id, "Purchase initiation failed: %d" % response)


func _on_purchase_updated(purchases: Array) -> void:
    for purchase_data in purchases:
        var product_id: String = purchase_data["productId"]
        var purchase_state: int = purchase_data["purchaseState"]

        if purchase_state == 1:  # PURCHASED
            # For consumables, consume to allow repurchase
            if _is_consumable(product_id):
                _billing.consumePurchase(purchase_data["purchaseToken"])
            else:
                # Non-consumable — acknowledge
                _billing.acknowledgePurchase(purchase_data["purchaseToken"])

            _grant_product(product_id)
            purchase_completed.emit(product_id)


func _on_purchase_error(response_code: int, debug_message: String) -> void:
    purchase_failed.emit("", "Error %d: %s" % [response_code, debug_message])


func _on_purchase_consumed(purchase_token: String) -> void:
    print("Purchase consumed: ", purchase_token)


func _on_consumption_error(response_code: int, debug_message: String) -> void:
    push_warning("Consumption error %d: %s" % [response_code, debug_message])


func _is_consumable(product_id: String) -> bool:
    return product_id in ["gems_100", "gems_500"]


func _grant_product(product_id: String) -> void:
    match product_id:
        "gems_100":
            PlayerData.add_gems(100)
        "gems_500":
            PlayerData.add_gems(500)
        "remove_ads":
            PlayerData.set_ads_removed(true)
```

### C# — Initialization

```csharp
using Godot;
using Godot.Collections;

public partial class IapManager : Node
{
    [Signal] public delegate void PurchaseCompletedEventHandler(string productId);
    [Signal] public delegate void PurchaseFailedEventHandler(string productId, string error);

    private GodotObject _billing;
    private Dictionary<string, Dictionary> _productDetails = new();

    public override void _Ready()
    {
        if (Engine.HasSingleton("GodotGooglePlayBilling"))
        {
            _billing = Engine.GetSingleton("GodotGooglePlayBilling");

            _billing.Connect("connected", Callable.From(OnConnected));
            _billing.Connect("disconnected", Callable.From(OnDisconnected));
            _billing.Connect("product_details_query_completed",
                Callable.From<Array>(OnProductDetails));
            _billing.Connect("purchase_updated",
                Callable.From<Array>(OnPurchaseUpdated));

            _billing.Call("startConnection");
        }
        else
        {
            GD.Print("Google Play Billing not available");
        }
    }

    private void OnConnected()
    {
        GD.Print("Billing connected");
        _billing.Call("queryProductDetails",
            new Array { "gems_100", "gems_500", "remove_ads" },
            "inapp");
    }

    private void OnDisconnected() => GD.Print("Billing disconnected");

    private void OnProductDetails(Array details)
    {
        foreach (Dictionary detail in details)
        {
            string productId = detail["productId"].AsString();
            _productDetails[productId] = detail;
            GD.Print($"Product: {productId} — {detail["price"]}");
        }
    }

    public void Purchase(string productId)
    {
        if (_billing == null)
        {
            EmitSignal(SignalName.PurchaseFailed, productId, "Billing not available");
            return;
        }
        _billing.Call("purchase", productId);
    }

    private void OnPurchaseUpdated(Array purchases)
    {
        foreach (Dictionary purchase in purchases)
        {
            string productId = purchase["productId"].AsString();
            int purchaseState = purchase["purchaseState"].AsInt32();

            if (purchaseState == 1) // PURCHASED
            {
                string token = purchase["purchaseToken"].AsString();
                _billing.Call("consumePurchase", token);
                EmitSignal(SignalName.PurchaseCompleted, productId);
            }
        }
    }
}
```

---

## 4. iOS — StoreKit Plugin

iOS IAP uses the `godot-ios-plugins` InAppPurchase plugin or a community StoreKit 2 alternative.

### Setup

1. Download the iOS InAppPurchase plugin from the Godot Asset Library.
2. Copy to `ios/plugins/` in your Godot project.
3. Enable in **Project → Export → iOS → Plugins**.
4. Configure products in App Store Connect under **Features → In-App Purchases**.

### GDScript — iOS IAP Pattern

```gdscript
extends Node

var _store: Object = null

func _ready() -> void:
    if Engine.has_singleton("InAppStore"):
        _store = Engine.get_singleton("InAppStore")


func request_product_info(product_ids: PackedStringArray) -> void:
    if _store == null:
        return
    _store.request_product_info({
        "product_ids": product_ids
    })


func purchase(product_id: String) -> void:
    if _store == null:
        return
    _store.purchase({"product_id": product_id})


func _process(_delta: float) -> void:
    # iOS plugin uses polling instead of signals
    if _store == null:
        return

    while _store.get_pending_event_count() > 0:
        var event: Dictionary = _store.pop_pending_event()
        match event.get("type", ""):
            "product_info":
                _handle_product_info(event)
            "purchase":
                _handle_purchase(event)
            "restore":
                _handle_restore(event)


func _handle_product_info(event: Dictionary) -> void:
    if event.get("result", "") == "ok":
        for product_id in event.get("ids", []):
            var title: String = event.get(product_id + "_title", "")
            var price: String = event.get(product_id + "_price", "")
            print("Product: %s — %s (%s)" % [product_id, title, price])


func _handle_purchase(event: Dictionary) -> void:
    if event.get("result", "") == "ok":
        var product_id: String = event.get("product_id", "")
        _grant_product(product_id)


func _handle_restore(event: Dictionary) -> void:
    if event.get("result", "") == "ok":
        var product_id: String = event.get("product_id", "")
        _grant_product(product_id)


func restore_purchases() -> void:
    if _store:
        _store.restore_purchases()


func _grant_product(_product_id: String) -> void:
    pass  # Implement your unlock logic
```

### C# — iOS IAP Pattern

The iOS `InAppStore` plugin uses the same singleton pattern. In C#, access it via `Engine.GetSingleton()` and poll events in `_Process()`:

```csharp
using Godot;

public partial class IosIapManager : Node
{
    private GodotObject _store;

    public override void _Ready()
    {
        if (Engine.HasSingleton("InAppStore"))
            _store = Engine.GetSingleton("InAppStore");
    }

    public void Purchase(string productId)
    {
        _store?.Call("purchase", new Godot.Collections.Dictionary
        {
            { "product_id", productId }
        });
    }

    public void RestorePurchases()
    {
        _store?.Call("restore_purchases");
    }

    public override void _Process(double delta)
    {
        if (_store == null) return;

        while ((int)_store.Call("get_pending_event_count") > 0)
        {
            var evt = (Godot.Collections.Dictionary)_store.Call("pop_pending_event");
            string type = evt.ContainsKey("type") ? evt["type"].AsString() : "";

            if (type == "purchase" && evt.ContainsKey("result")
                && evt["result"].AsString() == "ok")
            {
                string productId = evt["product_id"].AsString();
                GD.Print($"iOS purchase completed: {productId}");
                // Grant product here
            }
        }
    }
}
```

### StoreKit 2 Alternative

The first-party iOS plugin uses StoreKit 1. For StoreKit 2 features (better subscription management, transaction history, offer codes), community plugins on the Godot Asset Library provide unified APIs for both Android (Google Play Billing 8+) and iOS (StoreKit 2) with type-safe GDScript support. Search the Asset Library for "IAP" or "in-app purchase" to find current options.

---

## 5. Cross-Platform Abstraction Layer

Wrap platform-specific plugins behind a common interface so your game code never references a specific store.

### GDScript

```gdscript
class_name IAPInterface
extends RefCounted

## Abstract interface — extend per platform.

signal products_loaded(products: Array[Dictionary])
signal purchase_completed(product_id: String)
signal purchase_failed(product_id: String, error: String)

func initialize() -> void:
    pass

func query_products(_product_ids: PackedStringArray) -> void:
    pass

func purchase(_product_id: String) -> void:
    pass

func restore_purchases() -> void:
    pass
```

### GDScript — Platform Factory

```gdscript
## In your IAPManager autoload:

var _backend: IAPInterface

func _ready() -> void:
    if Engine.has_singleton("GodotGooglePlayBilling"):
        _backend = AndroidIAP.new()
    elif Engine.has_singleton("InAppStore"):
        _backend = IOSIap.new()
    else:
        _backend = StubIAP.new()  # Desktop/editor — does nothing

    _backend.purchase_completed.connect(_on_purchase_completed)
    _backend.purchase_failed.connect(_on_purchase_failed)
    _backend.initialize()
```

### Stub for Development

```gdscript
class_name StubIAP
extends IAPInterface

## Simulates purchases for desktop testing.

func initialize() -> void:
    print("[StubIAP] Initialized — purchases are simulated")

func query_products(product_ids: PackedStringArray) -> void:
    var fake_products: Array[Dictionary] = []
    for id in product_ids:
        fake_products.append({
            "product_id": id,
            "title": "Test: " + id,
            "price": "$0.99"
        })
    products_loaded.emit(fake_products)

func purchase(product_id: String) -> void:
    print("[StubIAP] Simulating purchase: ", product_id)
    # Simulate a 1-second delay
    await Engine.get_main_loop().create_timer(1.0).timeout
    purchase_completed.emit(product_id)

func restore_purchases() -> void:
    print("[StubIAP] Nothing to restore")
```

---

## 6. Receipt Validation

**Never trust the client.** A user can modify their device to fake purchase confirmations. Validate receipts server-side.

### Architecture

```
Game Client                  Your Server              Store API
    │                            │                       │
    │── purchase() ──────────────┼───────────────────────│
    │                            │                       │
    │◄── purchase_token ─────────┼───────────────────────│
    │                            │                       │
    │── send token to server ───►│                       │
    │                            │── validate token ────►│
    │                            │◄── valid/invalid ─────│
    │                            │                       │
    │◄── grant/deny ─────────────│                       │
```

### GDScript — Sending Token to Your Server

```gdscript
func _on_purchase_updated(purchases: Array) -> void:
    for purchase_data in purchases:
        if purchase_data["purchaseState"] == 1:
            _validate_receipt(
                purchase_data["productId"],
                purchase_data["purchaseToken"]
            )


func _validate_receipt(product_id: String, token: String) -> void:
    var http := HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(
        _on_validation_response.bind(product_id, http)
    )

    var body := JSON.stringify({
        "product_id": product_id,
        "purchase_token": token,
        "platform": "android"
    })

    http.request(
        "https://your-server.com/api/validate-receipt",
        ["Content-Type: application/json"],
        HTTPClient.METHOD_POST,
        body
    )


func _on_validation_response(
    result: int, code: int, headers: PackedStringArray,
    body: PackedByteArray, product_id: String, http: HTTPRequest
) -> void:
    http.queue_free()

    if code == 200:
        var response := JSON.parse_string(body.get_string_from_utf8()) as Dictionary
        if response and response.get("valid", false):
            _grant_product(product_id)
            return

    push_warning("Receipt validation failed for: ", product_id)
```

---

## 7. Restoring Purchases

Platform stores require a "Restore Purchases" button — especially Apple, which rejects apps without one.

### GDScript

```gdscript
## Call from a settings menu button.
func restore_purchases() -> void:
    if _backend:
        _backend.restore_purchases()
```

### When Restoration Triggers

- First launch after reinstall
- User taps "Restore Purchases" button
- Login to a new device with the same store account

Restored purchases call the same purchase callback as new purchases. Your `_grant_product()` function should be idempotent — granting the same non-consumable twice should not double-grant.

---

## 8. Monetization Patterns for Games

### Consumable Economy

```gdscript
## Soft currency (gems) purchased with real money.
## Gems spent on in-game items.

const STORE_PRODUCTS: Dictionary[String, int] = {
    "gems_100": 100,
    "gems_500": 500,
    "gems_1200": 1200,  # bonus: 20% extra
}

func _grant_product(product_id: String) -> void:
    if product_id in STORE_PRODUCTS:
        var gems: int = STORE_PRODUCTS[product_id]
        PlayerData.gems += gems
        PlayerData.save()
```

### Non-Consumable Unlocks

```gdscript
func _grant_product(product_id: String) -> void:
    match product_id:
        "remove_ads":
            PlayerData.ads_removed = true
        "level_pack_2":
            PlayerData.unlocked_levels.append("pack_2")
        "premium_skin_knight":
            PlayerData.unlocked_skins.append("knight")
    PlayerData.save()
```

### Ethical Guidelines

- Display real prices (from the store, not hardcoded) — prices vary by region.
- Clearly show what the player gets before purchase.
- Consumable economies should not be required to progress.
- Never show IAP prompts to users under 13 (COPPA compliance).
- Include a "Restore Purchases" option in settings.

---

## 9. Testing IAP

### Android

- **Internal testing track:** Upload to Google Play Console → Internal testing. Purchases are free for testers.
- **License testing:** Add tester email addresses in Google Play Console → Settings → License testing. These accounts get free purchases.
- **Test card:** Google provides `android.test.purchased` and other reserved product IDs for basic testing.

### iOS

- **Sandbox environment:** Use a Sandbox Apple ID (created in App Store Connect → Users → Sandbox Testers).
- **StoreKit Testing in Xcode:** Create a StoreKit configuration file for local testing without a network connection.

### Both Platforms

- Test purchase → grant → consume flow end-to-end.
- Test restore flow on a fresh install.
- Test failure cases: cancel, network error, pending payment.
- Test with VPN to check regional pricing.
- **Never test IAP in the Godot editor** — plugins are not available there. Use the StubIAP class for editor testing.

---

## 10. Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Not checking `Engine.has_singleton()` | Crash on platforms without the plugin | Always guard with existence check |
| Hardcoding prices | Wrong prices in other regions/currencies | Use prices returned by `queryProductDetails()` |
| Not consuming consumables | Player cannot repurchase | Call `consumePurchase()` after granting consumables |
| Not acknowledging non-consumables | Google refunds after 3 days | Call `acknowledgePurchase()` for non-consumables |
| Granting before validation | Exploitable with jailbroken devices | Validate receipts server-side first |
| Not handling pending purchases | Transaction stuck, user frustrated | Check for pending state and show appropriate UI |
| Missing "Restore Purchases" button | Apple App Store rejection | Always include restore functionality |
| Testing in editor | Plugin not available, false failures | Use a stub for editor, real plugin on device |
| Not saving after grant | Granted items lost on next launch | Persist granted items immediately |
