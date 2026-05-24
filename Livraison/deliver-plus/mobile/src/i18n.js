export const translations = {
  fr: {
    // Tabs
    tab_home: 'Accueil', tab_map: 'Carte', tab_earnings: 'Revenus', tab_profile: 'Profil',

    // Login
    login_subtitle: 'Connexion à votre compte',
    login_space: 'Espace Livreur',
    login_phone: 'Numéro de téléphone',
    login_email: 'Email', login_password: 'Mot de passe',
    login_btn: 'Se connecter',
    login_forgot: 'Mot de passe oublié ?',
    login_no_account: 'Pas de compte ?', login_register: "S'inscrire",
    login_not_driver: 'Pas encore livreur ?',
    login_create_account: 'Créer mon compte',

    // Profile
    p_firstname: 'Prénom', p_lastname: 'Nom', p_email: 'Email',
    p_phone: 'Téléphone', p_role: 'Rôle',
    p_driver: 'Livreur / Chauffeur', p_client: 'Client',
    p_logout: 'Déconnexion',
    p_lang: 'Langue', p_lang_fr: 'Français', p_lang_ar: 'عربي',
    p_lang_title: 'Changement de langue',
    p_lang_msg: "Fermez et rouvrez l'application pour appliquer la nouvelle langue.",
    p_lang_ok: 'OK',

    // Home — header
    home_hello: 'Bonjour,',
    home_solde: 'Solde',
    home_online: '🟢 En ligne', home_offline: '⚫ Hors ligne',
    home_receive: 'Vous recevez des commandes',
    home_activate: 'Activez pour recevoir des commandes',

    // Home — stats
    stat_deliveries: 'Livraisons', stat_rides: 'Courses',
    stat_earnings: 'Gains MRU', stat_rating: 'Note ★',

    // Home — nearby orders
    home_nearby: '🔔 Commandes disponibles',
    home_solde_req: 'Solde requis :', home_your_solde: 'Votre solde :',
    btn_refuse: 'Refuser', btn_accept: '✅ Accepter',
    btn_insufficient: '⚠️ Solde insuffisant',

    // Home — empty state
    wait_passenger: "En attente d'un passager...",
    wait_order: "En attente d'une commande...",
    go_online: 'Passez en ligne pour recevoir',
    current_solde: 'Votre solde actuel :',
    activate_hint: 'Activez le bouton ci-dessus.',

    // Alert overlay
    alert_new_order: '🚨 Nouvelle commande !',
    alert_new_ride: '🚖 Nouveau passager !',
    alert_meter: 'Prix au compteur',
    alert_open: 'Trajet ouvert',
    alert_low_solde: 'Solde insuffisant pour accepter',
    alert_reject: '✕ Refuser', alert_accept: '✓ Accepter',

    // Current order
    order_ride: 'Course', order_cmd: 'Commande',
    order_pickup: '📍 Retrait', order_delivery: '🏠 Livraison',
    order_pickup_ride: '📍 Prise en charge', order_dest_ride: '🏁 Destination',
    order_open_trip: '🚕 Trajet ouvert — destination à confirmer avec le passager',
    order_price_end: "Prix calculé à l'arrivée",
    order_commission: 'Com. :',
    order_comm_info: 'Prix calculé à la fin : prise en charge + km + minutes.',
    order_comm_pct: 'Commission', order_comm_final: 'prélevée sur le prix final.',
    order_at_delivery: 'À la livraison :',
    order_deducted: 'seront prélevés sur votre solde. Vous encaissez',
    order_cash: 'en cash auprès du client.',
    order_st_en_route_ride: '🚗 En route vers le passager',
    order_st_pickup_ride: '🧑 Aller chercher le passager',
    order_st_onboard: '⏱ Passager à bord — course en cours',

    // Action buttons
    btn_en_route_ride: '🚗 En route vers le passager',
    btn_onboard: '🧑 Passager à bord',
    btn_end_ride: '🏁 Fin de course',
    btn_pickup_order: '📦 Récupérer la commande',
    btn_delivered: '✅ Livré',

    // Solde modal
    modal_low_title: '⚠️ Solde insuffisant',
    modal_low_1: "Pour accepter, votre solde doit être d'au moins",
    modal_low_2: 'Votre solde actuel :',
    modal_low_3: "Contactez l'administrateur pour recharger votre solde.",
    modal_close: 'Fermer',

    // Accept alerts
    acc_ride_title: '🚖 Course acceptée !',
    acc_ride_msg: 'Rendez-vous à la position du passager.\nLe prix sera calculé automatiquement à la fin de la course.',
    acc_order_title: '✅ Commande acceptée !',
    acc_order_msg: 'Rendez-vous au point de retrait.\nCommission finale :',
    acc_order_msg2: 'MRU sera prélevée à la livraison.',

    // Dialogs
    confirm: 'Confirmer', cancel: 'Annuler',
    error: 'Erreur', err_update: 'Impossible de mettre à jour',
    err_status: 'Impossible de changer le statut',
    perm_denied: 'Permission refusée',
    solde_updated: '💰 Solde mis à jour',

    // Earnings
    earn_title: 'Mes revenus',
    earn_total: 'Total MRU', earn_count: 'Livraisons',
    earn_rating: 'Note ★', earn_history: 'Historique des livraisons',
    earn_empty: 'Aucune livraison effectuée',

    // Status
    s_en_attente: 'En attente', s_accepte: 'Accepté',
    s_en_preparation: 'En préparation', s_en_route: 'En route',
    s_livre: 'Livré', s_annule: 'Annulé',

    // Driver Register Screen
    reg_title: 'Inscription Livreur',
    reg_step0_sub: 'Informations personnelles',
    reg_step1_sub: 'Zone & Véhicule',
    reg_step2_sub: 'Documents requis',
    reg_step3_sub: 'Inscription envoyée !',
    reg_back: '← Retour',
    reg_continue: 'Continuer →',
    reg_firstname: 'Prénom *',
    reg_lastname: 'Nom *',
    reg_phone: 'Téléphone *',
    reg_email: 'Email',
    reg_email_optional: '(optionnel)',
    reg_password: 'Mot de passe *',
    reg_confirm_pwd: 'Confirmer le mot de passe *',
    reg_ph_firstname: 'Mohamed',
    reg_ph_lastname: 'Ould Ahmed',
    reg_ph_phone: '+222 36 00 00 00',
    reg_ph_email: 'livreur@email.com',
    reg_ph_password: '6 caractères minimum',
    reg_ph_confirm: 'Répéter le mot de passe',
    reg_zone: 'Zone de livraison *',
    reg_vehicle_type: 'Type de véhicule *',
    reg_docs_note: '📋 Tous les documents sont obligatoires pour valider votre dossier.',
    reg_doc_added: '✅ Ajouté',
    reg_doc_required: '⚠️ Requis',
    reg_doc_change: 'Changer',
    reg_doc_add: '📁 Ajouter',
    reg_submit: '✅ Envoyer le dossier',
    reg_submitting: 'Envoi en cours...',
    reg_doc_photo: 'Photo personnelle',
    reg_doc_vehicle: 'Photo du véhicule',
    reg_doc_grise: 'Carte grise',
    reg_doc_id: "Carte d'identité",
    reg_doc_insurance: 'Assurance',
    reg_success_title: 'Dossier envoyé !',
    reg_success_text: "Votre demande d'inscription a été transmise à l'administrateur.\nVous serez notifié par téléphone une fois votre compte validé.",
    reg_success_delay: '⏱️ Délai de traitement : 24 à 48 heures',
    reg_back_login: '← Retour à la connexion',
    reg_pick_source: 'Choisir depuis...',
    reg_camera: '📷 Appareil photo',
    reg_gallery: '🖼️ Galerie',
    reg_perm_denied: 'Permission refusée',
    reg_perm_cam: "Autorisez l'accès à l'appareil photo dans les paramètres.",
    reg_perm_gallery: "Autorisez l'accès à la galerie dans les paramètres.",
    reg_err: 'Erreur',
    reg_verify: 'Vérification',
    reg_err_register: 'Erreur inscription',
    reg_err_network: 'Erreur réseau',
    reg_err_server: 'Impossible de joindre le serveur.',
    reg_val_name: 'Prénom et nom obligatoires.',
    reg_val_phone: 'Numéro de téléphone obligatoire.',
    reg_val_pwd_len: 'Mot de passe : 6 caractères minimum.',
    reg_val_pwd_match: 'Les mots de passe ne correspondent pas.',
    reg_val_zone: 'Veuillez sélectionner une zone.',
    reg_val_vehicle: 'Veuillez sélectionner un type de véhicule.',
    reg_val_docs: 'Documents manquants :',

    // Map screen
    map_live: 'EN DIRECT',
    map_gps: 'Acquisition GPS…',
    map_en_route_badge: '🚗 En route',
    map_pickup_badge: '📦 Récupération',
    map_deliver_title: 'Livrer chez le client',
    map_retrieve_title: 'Récupérer la commande',
    map_marker_retrait: 'Retrait',
    map_marker_livraison: 'Livraison',

    // Cancellation flow
    btn_cancel_order: 'Annuler la course',
    cancel_modal_title: 'Annuler la commande',
    cancel_reason_ph: 'Raison de l\'annulation (obligatoire)...',
    cancel_confirm_btn: 'Confirmer l\'annulation',
    cancel_pending_title: 'En attente de vérification',
    cancel_pending_msg: "L'administrateur vérifie votre annulation. Vous ne pouvez pas encore accepter de nouvelles commandes.",
    cancel_pending_order: 'Commande annulée',
    cancel_err_reason: 'Veuillez indiquer la raison de l\'annulation.',

    // Referral system
    ref_section: 'Parrainage livreur',
    ref_your_code: 'Votre code de parrainage',
    ref_share: 'Partager',
    ref_solde_bonus: 'Bonus solde',
    ref_friends: 'livreur(s) parrainé(s)',
    ref_how: 'Partagez votre code → votre filleul gagne 500 MRU, vous aussi !',
    ref_apply_title: 'Utiliser un code parrain',
    ref_apply_ph: 'Code parrain (ex: DRVK3F2B)',
    ref_apply_btn: 'Appliquer',
    ref_apply_success: 'Code appliqué ! +500 MRU ajoutés à votre solde',
    ref_apply_err: 'Code invalide ou déjà utilisé',
    reg_referral_lbl: 'Code de parrainage',
    reg_referral_ph: 'Optionnel — ex: DRVK3F2B',
    reg_referral_hint: '(optionnel)',

    // Recharge solde
    recharge_btn:      '💬 Recharger via WhatsApp',
    recharge_whatsapp_msg: 'Bonjour, je souhaite recharger mon solde Amnir.\nMon numéro :',
    recharge_history:  'Historique des recharges',
    recharge_credit:   'Crédit', recharge_debit: 'Débit',
    recharge_empty:    'Aucune transaction',

    // Pending screen
    pending_title: 'Dossier en cours de vérification',
    pending_msg: "Votre dossier a bien été reçu. Notre équipe va vérifier vos documents et informations.\n\nVous recevrez une notification dès que votre compte sera activé.",
    pending_docs_title: 'Documents soumis :',
    pending_back: '← Retour à la connexion',

    // Rejected screen
    rejected_title: 'Dossier refusé',
    rejected_default_msg: "Votre dossier a été refusé par l'administrateur.",
    rejected_info: 'Pour toute question, contactez notre support ou soumettez un nouveau dossier avec des documents valides.',
    rejected_back: '← Retour à la connexion',

    // Complete docs screen
    complete_title: 'Compléter votre dossier',
    complete_docs_title: "Documents demandés par l'administrateur :",
    complete_added: '✅ Ajouté',
    complete_required: '⚠️ Requis',
    complete_change: 'Changer',
    complete_add: '📁 Ajouter',
    complete_send_btn: '✅ Envoyer les documents',
    complete_logout: 'Se déconnecter',
    complete_done_title: 'Dossier mis à jour !',
    complete_done_msg: "Vos documents ont été envoyés à l'administrateur. Vous serez notifié dès validation.",
    complete_back: '← Retour à la connexion',
    complete_missing_alert: 'Documents manquants',
    complete_missing_msg: 'Veuillez ajouter tous les documents demandés.',
    complete_net_err: 'Erreur réseau',
    complete_server_err: 'Impossible de joindre le serveur.',

    // Forgot password screen (driver)
    forgot_title: 'Mot de passe oublié',
    forgot_sub_phone: 'Entrez votre numéro pour réinitialiser',
    forgot_sub_otp: 'Code envoyé au',
    forgot_sub_pwd: 'Définissez votre nouveau mot de passe',
    forgot_phone_lbl: 'Numéro de téléphone',
    forgot_send_btn: 'Envoyer le code →',
    forgot_resend: 'Renvoyer le code',
    forgot_sec: 'sec',
    forgot_test_code: '🔧 Code de test :',
    forgot_continue_btn: '✓ Continuer',
    forgot_digits_left: 'chiffre(s) restant(s)',
    forgot_new_pwd_lbl: 'Nouveau mot de passe *',
    forgot_confirm_lbl: 'Confirmer le mot de passe *',
    forgot_new_pwd_ph: '6 caractères minimum',
    forgot_confirm_ph: 'Répéter le mot de passe',
    forgot_reset_btn: '✓ Réinitialiser le mot de passe',
    forgot_done_title: 'Mot de passe réinitialisé !',
    forgot_done_msg: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
    forgot_back_login: '← Se connecter',
    forgot_back: '← Retour à la connexion',
    forgot_not_found_title: 'Numéro non enregistré',
    forgot_not_found_msg: "n'existe pas dans notre système.\n\nVous devez d'abord créer un compte livreur.",
    forgot_create_account: 'Créer un compte',
    forgot_try_other: 'Essayer un autre numéro',

    // Chat
    chat_title:       'Chat',
    chat_open:        '💬 Chat',
    chat_empty:       'Aucun message. Démarrez la conversation !',
    chat_placeholder: 'Votre message...',
    chat_client:      'Client',
    chat_driver:      'Livreur',
    voice_recording:  'Enregistrement...',
    voice_sending:    'Envoi...',
    voice_perm_title: 'Permission refusée',
    voice_perm_msg:   'Autorisez le microphone dans les paramètres.',

    // Login errors
    login_err_invalid:   'Numéro ou mot de passe incorrect',
    login_err_suspended: 'Compte suspendu. Contactez l\'administrateur.',
    login_err_network:   'Erreur de connexion',

    // Shared placeholders
    phone_placeholder: 'ex: 36123456',
    pwd_placeholder: '6 caractères minimum',

    // Validation
    val_phone_invalid: 'Numéro invalide',
    val_phone_err: 'Doit contenir 8 chiffres et commencer par 2, 3 ou 4.',
    val_verify: 'Vérification',
    val_pwd_min: 'Le mot de passe doit contenir au moins 6 caractères.',
    val_pwd_mismatch: 'Les mots de passe ne correspondent pas.',

    // Vehicle types (DriverRegisterScreen)
    cd_moto: 'Moto', cd_voiture: 'Voiture', cd_velo: 'Vélo', cd_pied: 'À pied',

    // Service type (DriverRegisterScreen step 1)
    reg_service_type: 'Type de service',
    reg_livraison_lbl: 'Livraison', reg_livraison_desc: 'Colis, nourriture, pharmacie',
    reg_course_lbl: 'Course', reg_course_desc: 'Transport de personnes',

    // Verified phone badge
    reg_verified_num: 'Numéro vérifié',

    // Registration OTP step
    reg_otp_step_title: 'Vérification du numéro',
    reg_otp_phone_sub: 'Entrez votre numéro de téléphone',
    reg_otp_send_btn: 'Envoyer le code →',
    reg_otp_test: '🔧 Code de test :',
    reg_otp_resend: 'Renvoyer le code',
    reg_otp_verify_btn: '✓ Vérifier le numéro',
    reg_otp_digits: 'chiffre(s) restant(s)',
    reg_verified_badge: '✅ Numéro vérifié',

    // Pick source
    pick_source: 'Choisir depuis...',
    pick_camera: '📷 Appareil photo',
    pick_gallery: '🖼️ Galerie',
    pick_cancel: 'Annuler',
    perm_denied_cam: "Autorisez l'accès à l'appareil photo dans les paramètres.",
    perm_denied_gallery: "Autorisez l'accès à la galerie dans les paramètres.",
  },

  ar: {
    // Tabs
    tab_home: 'الرئيسية', tab_map: 'الخريطة', tab_earnings: 'الأرباح', tab_profile: 'الملف',

    // Login
    login_subtitle: 'تسجيل الدخول إلى حسابك',
    login_space: 'فضاء المُوصِّل',
    login_phone: 'رقم الهاتف',
    login_email: 'البريد الإلكتروني', login_password: 'كلمة المرور',
    login_btn: 'تسجيل الدخول',
    login_forgot: 'نسيت كلمة المرور؟',
    login_no_account: 'ليس لديك حساب؟', login_register: 'إنشاء حساب',
    login_not_driver: 'لست مُوصِّلاً بعد ؟',
    login_create_account: 'إنشاء حسابي',

    // Profile
    p_firstname: 'الاسم الأول', p_lastname: 'اللقب',
    p_email: 'البريد الإلكتروني', p_phone: 'الهاتف', p_role: 'الدور',
    p_driver: 'سائق / مُوصِّل', p_client: 'عميل',
    p_logout: 'تسجيل الخروج',
    p_lang: 'اللغة', p_lang_fr: 'Français', p_lang_ar: 'عربي',
    p_lang_title: 'تغيير اللغة',
    p_lang_msg: 'أغلق التطبيق وأعد تشغيله لتطبيق اللغة الجديدة.',
    p_lang_ok: 'حسناً',

    // Home — header
    home_hello: 'مرحباً،',
    home_solde: 'الرصيد',
    home_online: '🟢 متصل', home_offline: '⚫ غير متصل',
    home_receive: 'أنت تستقبل الطلبات',
    home_activate: 'فعّل للاستقبال',

    // Home — stats
    stat_deliveries: 'التوصيلات', stat_rides: 'الرحلات',
    stat_earnings: 'الأرباح MRU', stat_rating: 'التقييم ★',

    // Home — nearby orders
    home_nearby: '🔔 الطلبات المتاحة',
    home_solde_req: 'الرصيد المطلوب:', home_your_solde: 'رصيدك:',
    btn_refuse: 'رفض', btn_accept: '✅ قبول',
    btn_insufficient: '⚠️ رصيد غير كافٍ',

    // Home — empty state
    wait_passenger: 'في انتظار راكب...',
    wait_order: 'في انتظار طلب...',
    go_online: 'اتصل لاستقبال الطلبات',
    current_solde: 'رصيدك الحالي:',
    activate_hint: 'فعّل الزر أعلاه.',

    // Alert overlay
    alert_new_order: '🚨 طلب جديد!',
    alert_new_ride: '🚖 راكب جديد!',
    alert_meter: 'السعر بالعداد',
    alert_open: 'رحلة مفتوحة',
    alert_low_solde: 'رصيد غير كافٍ للقبول',
    alert_reject: '✕ رفض', alert_accept: '✓ قبول',

    // Current order
    order_ride: 'رحلة', order_cmd: 'طلب',
    order_pickup: '📍 نقطة الاستلام', order_delivery: '🏠 التسليم',
    order_pickup_ride: '📍 نقطة الانطلاق', order_dest_ride: '🏁 الوجهة',
    order_open_trip: '🚕 رحلة مفتوحة — حدد الوجهة مع الراكب',
    order_price_end: 'السعر يُحسب عند الوصول',
    order_commission: 'العمولة:',
    order_comm_info: 'السعر يُحسب في النهاية: أساسي + كم + دقائق.',
    order_comm_pct: 'عمولة', order_comm_final: 'تُخصم من السعر النهائي.',
    order_at_delivery: 'عند التسليم:',
    order_deducted: 'ستُخصم من رصيدك. تتلقى',
    order_cash: 'نقداً من العميل.',
    order_st_en_route_ride: '🚗 في الطريق إلى الراكب',
    order_st_pickup_ride: '🧑 اذهب لاستقبال الراكب',
    order_st_onboard: '⏱ الراكب على متن السيارة — الرحلة جارية',

    // Action buttons
    btn_en_route_ride: '🚗 في الطريق إلى الراكب',
    btn_onboard: '🧑 الراكب على متن السيارة',
    btn_end_ride: '🏁 نهاية الرحلة',
    btn_pickup_order: '📦 استلام الطلب',
    btn_delivered: '✅ تم التسليم',

    // Solde modal
    modal_low_title: '⚠️ رصيد غير كافٍ',
    modal_low_1: 'لقبول هذا الطلب، يجب أن يكون رصيدك على الأقل',
    modal_low_2: 'رصيدك الحالي:',
    modal_low_3: 'اتصل بالمدير لشحن رصيدك.',
    modal_close: 'إغلاق',

    // Accept alerts
    acc_ride_title: '🚖 رحلة مقبولة!',
    acc_ride_msg: 'توجه إلى موقع الراكب.\nسيتم احتساب السعر تلقائياً في نهاية الرحلة.',
    acc_order_title: '✅ طلب مقبول!',
    acc_order_msg: 'توجه إلى نقطة الاستلام.\nالعمولة النهائية:',
    acc_order_msg2: 'MRU ستُخصم عند التسليم.',

    // Dialogs
    confirm: 'تأكيد', cancel: 'إلغاء',
    error: 'خطأ', err_update: 'تعذّر التحديث',
    err_status: 'تعذّر تغيير الحالة',
    perm_denied: 'تم رفض الإذن',
    solde_updated: '💰 تم تحديث الرصيد',

    // Earnings
    earn_title: 'أرباحي',
    earn_total: 'المجموع MRU', earn_count: 'التوصيلات',
    earn_rating: 'التقييم ★', earn_history: 'سجل التوصيلات',
    earn_empty: 'لا توجد توصيلات بعد',

    // Status
    s_en_attente: 'في الانتظار', s_accepte: 'مقبول',
    s_en_preparation: 'قيد التحضير', s_en_route: 'في الطريق',
    s_livre: 'تم التسليم', s_annule: 'ملغى',

    // Driver Register Screen
    reg_title: 'تسجيل مُوصِّل',
    reg_step0_sub: 'المعلومات الشخصية',
    reg_step1_sub: 'المنطقة والمركبة',
    reg_step2_sub: 'المستندات المطلوبة',
    reg_step3_sub: 'تم إرسال الملف !',
    reg_back: '→ رجوع',
    reg_continue: 'متابعة ←',
    reg_firstname: 'الاسم الأول *',
    reg_lastname: 'اللقب *',
    reg_phone: 'الهاتف *',
    reg_email: 'البريد الإلكتروني',
    reg_email_optional: '(اختياري)',
    reg_password: 'كلمة المرور *',
    reg_confirm_pwd: 'تأكيد كلمة المرور *',
    reg_ph_firstname: 'محمد',
    reg_ph_lastname: 'ولد أحمد',
    reg_ph_phone: '+222 36 00 00 00',
    reg_ph_email: 'livreur@email.com',
    reg_ph_password: '6 أحرف على الأقل',
    reg_ph_confirm: 'كرر كلمة المرور',
    reg_zone: 'منطقة التوصيل *',
    reg_vehicle_type: 'نوع المركبة *',
    reg_docs_note: '📋 جميع المستندات إلزامية للتحقق من ملفك.',
    reg_doc_added: '✅ تمت الإضافة',
    reg_doc_required: '⚠️ مطلوب',
    reg_doc_change: 'تغيير',
    reg_doc_add: '📁 إضافة',
    reg_submit: '✅ إرسال الملف',
    reg_submitting: 'جارٍ الإرسال...',
    reg_doc_photo: 'صورة شخصية',
    reg_doc_vehicle: 'صورة المركبة',
    reg_doc_grise: 'بطاقة المركبة',
    reg_doc_id: 'بطاقة الهوية',
    reg_doc_insurance: 'التأمين',
    reg_success_title: 'تم إرسال الملف !',
    reg_success_text: 'تم إرسال طلب التسجيل إلى المدير.\nستتلقى إشعاراً عبر الهاتف بمجرد التحقق من حسابك.',
    reg_success_delay: '⏱️ مدة المعالجة: 24 إلى 48 ساعة',
    reg_back_login: '→ العودة إلى تسجيل الدخول',
    reg_pick_source: 'اختر من...',
    reg_camera: '📷 الكاميرا',
    reg_gallery: '🖼️ المعرض',
    reg_perm_denied: 'تم رفض الإذن',
    reg_perm_cam: 'يرجى السماح بالوصول إلى الكاميرا في الإعدادات.',
    reg_perm_gallery: 'يرجى السماح بالوصول إلى المعرض في الإعدادات.',
    reg_err: 'خطأ',
    reg_verify: 'تحقق',
    reg_err_register: 'خطأ في التسجيل',
    reg_err_network: 'خطأ في الشبكة',
    reg_err_server: 'تعذّر الاتصال بالخادم.',
    reg_val_name: 'الاسم الأول واللقب إلزاميان.',
    reg_val_phone: 'رقم الهاتف إلزامي.',
    reg_val_pwd_len: 'كلمة المرور: 6 أحرف على الأقل.',
    reg_val_pwd_match: 'كلمتا المرور غير متطابقتين.',
    reg_val_zone: 'يرجى اختيار منطقة.',
    reg_val_vehicle: 'يرجى اختيار نوع المركبة.',
    reg_val_docs: 'مستندات مفقودة:',

    // Map screen
    map_live: 'مباشر',
    map_gps: 'جارٍ تحديد GPS…',
    map_en_route_badge: '🚗 في الطريق',
    map_pickup_badge: '📦 استلام',
    map_deliver_title: 'توصيل للعميل',
    map_retrieve_title: 'استلام الطلب',
    map_marker_retrait: 'الاستلام',
    map_marker_livraison: 'التوصيل',

    // Cancellation flow
    btn_cancel_order: 'إلغاء الطلب',
    cancel_modal_title: 'إلغاء الطلب',
    cancel_reason_ph: 'سبب الإلغاء (إلزامي)...',
    cancel_confirm_btn: 'تأكيد الإلغاء',
    cancel_pending_title: 'في انتظار التحقق',
    cancel_pending_msg: 'يتحقق المدير من إلغائك. لا يمكنك استقبال طلبات جديدة في الوقت الحالي.',
    cancel_pending_order: 'طلب ملغى',
    cancel_err_reason: 'يرجى ذكر سبب الإلغاء.',

    // Referral system
    ref_section: 'إحالة السائق',
    ref_your_code: 'رمز الإحالة الخاص بك',
    ref_share: 'مشاركة',
    ref_solde_bonus: 'مكافأة الرصيد',
    ref_friends: 'سائق(ون) تمت إحالتهم',
    ref_how: 'شارك رمزك → مُحالك يربح 500 MRU، وأنت أيضاً !',
    ref_apply_title: 'استخدام رمز إحالة',
    ref_apply_ph: 'رمز الإحالة (مثل: DRVK3F2B)',
    ref_apply_btn: 'تطبيق',
    ref_apply_success: 'تم تطبيق الرمز ! +500 MRU أضيفت إلى رصيدك',
    ref_apply_err: 'الرمز غير صالح أو تم استخدامه',
    reg_referral_lbl: 'رمز الإحالة',
    reg_referral_ph: 'اختياري — مثل: DRVK3F2B',
    reg_referral_hint: '(اختياري)',

    // Recharge solde
    recharge_btn:      '💬 شحن عبر واتساب',
    recharge_whatsapp_msg: 'مرحباً، أريد شحن رصيدي في Amnir.\nرقمي:',
    recharge_history:  'سجل الشحن',
    recharge_credit:   'إضافة', recharge_debit: 'خصم',
    recharge_empty:    'لا توجد معاملات',

    // Pending screen
    pending_title: 'الملف قيد المراجعة',
    pending_msg: 'تم استلام ملفك. سيقوم فريقنا بمراجعة مستنداتك ومعلوماتك.\n\nستتلقى إشعاراً عند تفعيل حسابك.',
    pending_docs_title: 'المستندات المقدمة:',
    pending_back: '→ العودة إلى تسجيل الدخول',

    // Rejected screen
    rejected_title: 'تم رفض الملف',
    rejected_default_msg: 'تم رفض ملفك من قِبَل المدير.',
    rejected_info: 'لأي استفسار، تواصل مع الدعم أو أرسل ملفاً جديداً بمستندات صحيحة.',
    rejected_back: '→ العودة إلى تسجيل الدخول',

    // Complete docs screen
    complete_title: 'إكمال الملف',
    complete_docs_title: 'المستندات المطلوبة من المدير:',
    complete_added: '✅ تمت الإضافة',
    complete_required: '⚠️ مطلوب',
    complete_change: 'تغيير',
    complete_add: '📁 إضافة',
    complete_send_btn: '✅ إرسال المستندات',
    complete_logout: 'تسجيل الخروج',
    complete_done_title: 'تم تحديث الملف!',
    complete_done_msg: 'تم إرسال مستنداتك إلى المدير. ستتلقى إشعاراً عند التحقق.',
    complete_back: '→ العودة إلى تسجيل الدخول',
    complete_missing_alert: 'مستندات مفقودة',
    complete_missing_msg: 'يرجى إضافة جميع المستندات المطلوبة.',
    complete_net_err: 'خطأ في الشبكة',
    complete_server_err: 'تعذّر الاتصال بالخادم.',

    // Forgot password screen (driver)
    forgot_title: 'نسيت كلمة المرور',
    forgot_sub_phone: 'أدخل رقمك لإعادة التعيين',
    forgot_sub_otp: 'تم إرسال الرمز إلى',
    forgot_sub_pwd: 'حدد كلمة مرورك الجديدة',
    forgot_phone_lbl: 'رقم الهاتف',
    forgot_send_btn: 'إرسال الرمز ←',
    forgot_resend: 'إعادة الإرسال',
    forgot_sec: 'ث',
    forgot_test_code: '🔧 رمز الاختبار:',
    forgot_continue_btn: '✓ متابعة',
    forgot_digits_left: 'رقم متبقٍ',
    forgot_new_pwd_lbl: 'كلمة المرور الجديدة *',
    forgot_confirm_lbl: 'تأكيد كلمة المرور *',
    forgot_new_pwd_ph: '6 أحرف على الأقل',
    forgot_confirm_ph: 'كرر كلمة المرور',
    forgot_reset_btn: '✓ إعادة تعيين كلمة المرور',
    forgot_done_title: 'تم إعادة تعيين كلمة المرور!',
    forgot_done_msg: 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    forgot_back_login: '← تسجيل الدخول',
    forgot_back: '→ العودة إلى تسجيل الدخول',
    forgot_not_found_title: 'الرقم غير مسجل',
    forgot_not_found_msg: 'غير موجود في نظامنا.\n\nيجب عليك أولاً إنشاء حساب مُوصِّل.',
    forgot_create_account: 'إنشاء حساب',
    forgot_try_other: 'تجربة رقم آخر',

    // Chat
    chat_title:       'محادثة',
    chat_open:        '💬 محادثة',
    chat_empty:       'لا رسائل. ابدأ المحادثة !',
    chat_placeholder: 'رسالتك...',
    chat_client:      'العميل',
    chat_driver:      'المُوصِّل',
    voice_recording:  'جارٍ التسجيل...',
    voice_sending:    'جارٍ الإرسال...',
    voice_perm_title: 'الإذن مرفوض',
    voice_perm_msg:   'يرجى السماح باستخدام الميكروفون في الإعدادات.',

    // Login errors
    login_err_invalid:   'رقم الهاتف أو كلمة المرور غير صحيحة',
    login_err_suspended: 'الحساب معلق. تواصل مع المدير.',
    login_err_network:   'خطأ في الاتصال',

    // Validation
    val_phone_invalid: 'رقم غير صالح',
    val_phone_err: 'يجب أن يحتوي على 8 أرقام ويبدأ بـ 2 أو 3 أو 4.',
    val_verify: 'تحقق',
    val_pwd_min: 'يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.',
    val_pwd_mismatch: 'كلمتا المرور غير متطابقتين.',

    // Vehicle types (DriverRegisterScreen)
    cd_moto: 'دراجة نارية', cd_voiture: 'سيارة', cd_velo: 'دراجة هوائية', cd_pied: 'سيراً',

    // Service type (DriverRegisterScreen step 1)
    reg_service_type: 'نوع الخدمة',
    reg_livraison_lbl: 'توصيل', reg_livraison_desc: 'طرود، طعام، صيدلية',
    reg_course_lbl: 'رحلة', reg_course_desc: 'نقل الأشخاص',

    // Verified phone badge
    reg_verified_num: 'رقم تم التحقق منه',

    // Registration OTP step
    reg_otp_step_title: 'التحقق من الرقم',
    reg_otp_phone_sub: 'أدخل رقم هاتفك',
    reg_otp_send_btn: 'إرسال الرمز ←',
    reg_otp_test: '🔧 رمز الاختبار:',
    reg_otp_resend: 'إعادة الإرسال',
    reg_otp_verify_btn: '✓ تحقق من الرقم',
    reg_otp_digits: 'رقم متبقٍ',
    reg_verified_badge: '✅ تم التحقق من الرقم',

    // Pick source
    pick_source: 'اختر من...',
    pick_camera: '📷 الكاميرا',
    pick_gallery: '🖼️ المعرض',
    pick_cancel: 'إلغاء',
    perm_denied_cam: 'يرجى السماح بالوصول إلى الكاميرا في الإعدادات.',
    perm_denied_gallery: 'يرجى السماح بالوصول إلى المعرض في الإعدادات.',
  },
};
