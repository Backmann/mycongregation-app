// Legal texts for mycongregation.org, rendered by app/legal/index.tsx.
// Verbindlich ist die deutsche Fassung (the German version prevails).
// Edition: 01.07.2026.

export type Lang = 'ru' | 'de' | 'en';
export type DocKey = 'impressum' | 'privacy' | 'terms' | 'disclaimer';

export type Block = { h?: string; p?: string; li?: string[] };
export type Doc = { title: string; tab: string; blocks: Block[] };

export const LEGAL_UPDATED = '01.07.2026';

const ADDRESS = 'Beverfördering 66, 59071 Hamm, Deutschland';
const EMAIL = 'info@mycongregation.org';
const REPO_SERVER = 'https://github.com/Backmann/mycongregation-server';
const REPO_APP = 'https://github.com/Backmann/mycongregation-app';

export const LEGAL: Record<Lang, Record<DocKey, Doc>> = {
  ru: {
    impressum: {
      title: 'Выходные данные (Impressum)',
      tab: 'Impressum',
      blocks: [
        { p: 'Согласно §5 DDG / §18 MStV.' },
        { h: 'Ответственный (Verantwortlich)' },
        { p: 'Lionel Backmann' },
        { p: ADDRESS },
        { p: 'E-Mail: ' + EMAIL },
        { p: 'Проект некоммерческий и бесплатный; коммерческой деятельности и обязанности по НДС нет.' },
        { p: 'Ответственный за содержание по §18 Abs. 2 MStV: Lionel Backmann (адрес выше).' },
      ],
    },
    privacy: {
      title: 'Политика конфиденциальности',
      tab: 'Конфиденциальность',
      blocks: [
        { h: 'Кто отвечает за данные (контролёр)' },
        { p: 'Lionel Backmann, ' + EMAIL + ', ' + ADDRESS + '.' },
        { h: 'Что это за сервис' },
        { p: 'mycongregation.org — закрытое приложение для внутренней организации жизни религиозного собрания. Доступ есть только у лиц, которым выдана учётная запись и которые дали письменное согласие на обработку своих данных. Для посторонних приложение закрыто.' },
        { h: 'Какие данные обрабатываются' },
        { li: [
          'Учётная запись: e-mail, пароль (хранится только в виде хеша), роль, язык интерфейса, время последнего входа/активности.',
          'Данные возвещателя: имя, отчество, фамилия, пол, дата рождения, телефон, e-mail, адрес (телефон, e-mail и адрес шифруются в базе), служебное назначение, даты крещения и начала служения, пионерский статус, активность, способности, номера публичных речей, организационные заметки.',
          'Организационные данные: назначения, отсутствия, отчёты о служении (часы, изучения Библии), дежурства, обмен публичными речами, особые события.',
          'Технические данные: токены push-уведомлений и web-push-подписки; журнал действий «кто что изменил».',
        ] },
        { h: 'Особая категория данных (ст. 9 GDPR)' },
        { p: 'Поскольку речь идёт о членах религиозного собрания, данные относятся к религиозным убеждениям (особая категория). Правовое основание — явное согласие субъекта (подписанная форма), ст. 9(2)(a), в рамках законной деятельности религиозной общины в отношении её членов (ст. 9(2)(d)). Поля свободного текста («заметки») предназначены только для организационных пометок; вносить туда чувствительные сведения не следует.' },
        { h: 'Цели и правовые основания' },
        { li: [
          'Организация встреч, назначений и служения — согласие (ст. 6(1)(a)) и законный интерес общины (ст. 6(1)(f)); для религиозных данных — ст. 9(2)(a)/(d).',
          'Учётная запись, вход и безопасность — ст. 6(1)(b)/(f).',
        ] },
        { h: 'Кому передаются данные (субпроцессоры)' },
        { li: [
          'Hetzner Online GmbH (Германия) — хостинг, база данных, резервные копии; данные в ЕС.',
          'Cloudflare, Inc. (США) — CDN/прокси/защита; обрабатывает IP и метаданные запросов. Передача за пределы ЕС — на основании SCC и/или EU-US Data Privacy Framework.',
          'Доставка push-уведомлений — через push-сервисы браузеров и ОС (Google, Mozilla, Apple) и Expo (для мобильных сборок).',
          'Электронная почта отправляется с собственного сервера на инфраструктуре Hetzner.',
          'Рекламы, аналитики и трекинга нет.',
        ] },
        { h: 'Сроки хранения' },
        { li: [
          'Данные члена — пока он активен в собрании; после выхода удаляются/анонимизируются в разумный срок.',
          'Учётная запись — пока активна.',
          'Журнал действий — 12 месяцев.',
          'Резервные копии — в пределах цикла ротации.',
        ] },
        { h: 'Безопасность (ст. 32 GDPR)' },
        { p: 'Контактные данные и заметки шифруются в базе; пароли и токены сброса хранятся в виде хешей; доступ разграничен по ролям; хостинг в ЕС; регулярные резервные копии; доступ — только авторизованным по защищённому соединению.' },
        { h: 'Права субъекта данных' },
        { p: 'Вы вправе получить доступ к своим данным, исправить их, удалить, ограничить обработку, получить их в переносимом виде, возразить против обработки и в любой момент отозвать согласие (без влияния на законность прошлой обработки). Запрос — на ' + EMAIL + '. Вы также вправе подать жалобу в надзорный орган (для NRW — LDI NRW).' },
        { h: 'Несовершеннолетние' },
        { p: 'Если членами собрания являются несовершеннолетние, их данные вносятся и обрабатываются с согласия законных представителей.' },
        { h: 'Изменения' },
        { p: 'Действующая редакция: ' + LEGAL_UPDATED + '. О существенных изменениях пользователи уведомляются в приложении.' },
      ],
    },
    terms: {
      title: 'Условия использования',
      tab: 'Условия',
      blocks: [
        { h: 'Назначение' },
        { p: 'Сервис — инструмент для внутренней организации собрания; доступ предоставляется по приглашению уполномоченным лицом.' },
        { h: 'Учётная запись' },
        { p: 'Доступ персональный; передавать логин/пароль третьим лицам нельзя. За сохранность пароля отвечает пользователь.' },
        { h: 'Допустимое использование' },
        { p: 'Данные используются только в законных организационных целях собрания. Запрещено извлекать, копировать или распространять данные других лиц вне этих целей.' },
        { h: 'Отсутствие гарантий и ответственность' },
        { p: 'Сервис предоставляется «как есть» (лицензия AGPL-3.0), без гарантий бесперебойной работы или пригодности для конкретной цели. Ответственность оператора ограничена в пределах, допустимых законом; за косвенный или случайный ущерб оператор не отвечает в допустимой законом мере.' },
        { h: 'Приостановка доступа' },
        { p: 'Оператор вправе ограничить или приостановить доступ при нарушении настоящих условий.' },
        { h: 'Открытый исходный код' },
        { p: 'Сервис распространяется под GNU AGPL-3.0; исходный код доступен:' },
        { li: ['Сервер: ' + REPO_SERVER, 'Приложение: ' + REPO_APP] },
        { h: 'Применимое право' },
        { p: 'Право Федеративной Республики Германия. При расхождении языковых версий действует немецкая редакция.' },
      ],
    },
    disclaimer: {
      title: 'Оговорка о неофициальности',
      tab: 'Оговорка',
      blocks: [
        { p: 'mycongregation.org — независимый, неофициальный инструмент. Он не связан, не одобрен и не аффилирован с Watch Tower Bible and Tract Society of Pennsylvania, Wachtturm Bibel- und Traktat-Gesellschaft или сайтом jw.org.' },
        { p: 'Сервис не использует их официальные товарные знаки, логотипы и фирменный стиль. Любые упоминания публикаций служат исключительно целям удобной организации встреч и не подразумевают официальной связи или одобрения.' },
      ],
    },
  },

  de: {
    impressum: {
      title: 'Impressum',
      tab: 'Impressum',
      blocks: [
        { p: 'Angaben gemäß §5 DDG / §18 MStV.' },
        { h: 'Verantwortlich' },
        { p: 'Lionel Backmann' },
        { p: ADDRESS },
        { p: 'E-Mail: ' + EMAIL },
        { p: 'Es handelt sich um ein nichtkommerzielles, kostenloses Projekt; keine gewerbliche Tätigkeit, keine Umsatzsteuerpflicht.' },
        { p: 'Verantwortlich für den Inhalt nach §18 Abs. 2 MStV: Lionel Backmann (Anschrift oben).' },
      ],
    },
    privacy: {
      title: 'Datenschutzerklärung',
      tab: 'Datenschutz',
      blocks: [
        { h: 'Verantwortlicher' },
        { p: 'Lionel Backmann, ' + EMAIL + ', ' + ADDRESS + '.' },
        { h: 'Was ist dieser Dienst' },
        { p: 'mycongregation.org ist eine geschlossene Anwendung zur internen Organisation des Lebens einer religiösen Versammlung. Zugang haben ausschließlich Personen, die ein Konto erhalten und schriftlich in die Verarbeitung ihrer Daten eingewilligt haben. Für Dritte ist die Anwendung nicht zugänglich.' },
        { h: 'Welche Daten verarbeitet werden' },
        { li: [
          'Konto: E-Mail, Passwort (nur als Hash gespeichert), Rolle, Sprache, Zeitpunkt der letzten Anmeldung/Aktivität.',
          'Verkündigerdaten: Vor-, Vaters- und Nachname, Geschlecht, Geburtsdatum, Telefon, E-Mail, Anschrift (Telefon, E-Mail und Anschrift werden in der Datenbank verschlüsselt), Ernennung, Tauf- und Dienstbeginndatum, Pionierstatus, Aktivität, Fähigkeiten, Nummern öffentlicher Vorträge, organisatorische Notizen.',
          'Organisatorische Daten: Zuteilungen, Abwesenheiten, Dienstberichte (Stunden, Bibelstudien), Aufgaben, Vortragsaustausch, besondere Ereignisse.',
          'Technische Daten: Push-/Web-Push-Token; Protokoll „wer hat was geändert".',
        ] },
        { h: 'Besondere Datenkategorien (Art. 9 DSGVO)' },
        { p: 'Da es sich um Mitglieder einer religiösen Versammlung handelt, betreffen die Daten religiöse Überzeugungen (besondere Kategorie). Rechtsgrundlage ist die ausdrückliche Einwilligung (unterschriebenes Formular), Art. 9(2)(a), im Rahmen der rechtmäßigen Tätigkeit einer religiösen Gemeinschaft gegenüber ihren Mitgliedern (Art. 9(2)(d)). Freitextfelder („Notizen") dienen nur organisatorischen Zwecken; sensible Angaben sollen dort nicht eingetragen werden.' },
        { h: 'Zwecke und Rechtsgrundlagen' },
        { li: [
          'Organisation von Zusammenkünften, Zuteilungen und Dienst — Einwilligung (Art. 6(1)(a)) und berechtigtes Interesse der Gemeinschaft (Art. 6(1)(f)); für religiöse Daten Art. 9(2)(a)/(d).',
          'Konto, Anmeldung und Sicherheit — Art. 6(1)(b)/(f).',
        ] },
        { h: 'Empfänger (Auftragsverarbeiter)' },
        { li: [
          'Hetzner Online GmbH (Deutschland) — Hosting, Datenbank, Backups; Daten in der EU.',
          'Cloudflare, Inc. (USA) — CDN/Proxy/Schutz; verarbeitet IP und Anfrage-Metadaten. Übermittlung in die USA auf Grundlage der Standardvertragsklauseln und/oder des EU-US Data Privacy Framework.',
          'Zustellung von Push-Nachrichten über Push-Dienste der Browser und Betriebssysteme (Google, Mozilla, Apple) sowie Expo (für mobile Builds).',
          'E-Mails werden über einen eigenen Server auf der Hetzner-Infrastruktur versendet.',
          'Keine Werbung, kein Tracking, keine Analyse.',
        ] },
        { h: 'Speicherdauer' },
        { li: [
          'Mitgliederdaten — solange die Person in der Versammlung aktiv ist; danach Löschung/Anonymisierung in angemessener Frist.',
          'Konto — solange es aktiv ist.',
          'Aktivitätsprotokoll — 12 Monate.',
          'Backups — im Rahmen des Rotationszyklus.',
        ] },
        { h: 'Sicherheit (Art. 32 DSGVO)' },
        { p: 'Kontaktdaten und Notizen werden in der Datenbank verschlüsselt; Passwörter und Reset-Token werden nur als Hash gespeichert; Zugriff ist rollenbasiert; Hosting in der EU; regelmäßige Backups; Zugriff nur für autorisierte Personen über eine gesicherte Verbindung.' },
        { h: 'Ihre Rechte' },
        { p: 'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch und auf jederzeitigen Widerruf der Einwilligung (ohne Auswirkung auf die Rechtmäßigkeit der bisherigen Verarbeitung). Anfragen an ' + EMAIL + '. Es besteht ein Beschwerderecht bei einer Aufsichtsbehörde (für NRW: LDI NRW).' },
        { h: 'Minderjährige' },
        { p: 'Sind Mitglieder minderjährig, werden ihre Daten mit Einwilligung der gesetzlichen Vertreter verarbeitet.' },
        { h: 'Änderungen' },
        { p: 'Aktuelle Fassung: ' + LEGAL_UPDATED + '. Über wesentliche Änderungen werden die Nutzer in der Anwendung informiert.' },
      ],
    },
    terms: {
      title: 'Nutzungsbedingungen',
      tab: 'Nutzung',
      blocks: [
        { h: 'Zweck' },
        { p: 'Der Dienst ist ein Werkzeug zur internen Organisation der Versammlung; der Zugang erfolgt auf Einladung durch eine berechtigte Person.' },
        { h: 'Konto' },
        { p: 'Der Zugang ist persönlich; Zugangsdaten dürfen nicht an Dritte weitergegeben werden. Für die Geheimhaltung des Passworts ist der Nutzer verantwortlich.' },
        { h: 'Zulässige Nutzung' },
        { p: 'Die Daten dürfen nur zu rechtmäßigen organisatorischen Zwecken der Versammlung verwendet werden. Das Auslesen, Kopieren oder Verbreiten von Daten anderer Personen außerhalb dieser Zwecke ist untersagt.' },
        { h: 'Keine Gewähr / Haftung' },
        { p: 'Der Dienst wird „wie besehen" bereitgestellt (Lizenz AGPL-3.0), ohne Gewähr für ununterbrochenen Betrieb oder Eignung für einen bestimmten Zweck. Die Haftung des Betreibers ist im gesetzlich zulässigen Rahmen beschränkt; für mittelbare oder zufällige Schäden wird im gesetzlich zulässigen Umfang nicht gehaftet.' },
        { h: 'Aussetzung des Zugangs' },
        { p: 'Der Betreiber kann den Zugang bei Verstoß gegen diese Bedingungen einschränken oder aussetzen.' },
        { h: 'Open Source' },
        { p: 'Der Dienst steht unter der GNU AGPL-3.0; der Quellcode ist verfügbar:' },
        { li: ['Server: ' + REPO_SERVER, 'App: ' + REPO_APP] },
        { h: 'Anwendbares Recht' },
        { p: 'Es gilt das Recht der Bundesrepublik Deutschland. Bei Abweichungen zwischen den Sprachfassungen ist die deutsche Fassung maßgeblich.' },
      ],
    },
    disclaimer: {
      title: 'Hinweis zur Unabhängigkeit',
      tab: 'Hinweis',
      blocks: [
        { p: 'mycongregation.org ist ein unabhängiges, inoffizielles Werkzeug. Es ist nicht verbunden mit, nicht unterstützt von und nicht zugehörig zur Watch Tower Bible and Tract Society of Pennsylvania, zur Wachtturm Bibel- und Traktat-Gesellschaft oder zu jw.org.' },
        { p: 'Der Dienst verwendet keine offiziellen Marken, Logos oder das Erscheinungsbild dieser Organisationen. Verweise auf Veröffentlichungen dienen ausschließlich der praktischen Organisation der Zusammenkünfte und begründen keine offizielle Verbindung oder Billigung.' },
      ],
    },
  },

  en: {
    impressum: {
      title: 'Legal notice (Impressum)',
      tab: 'Impressum',
      blocks: [
        { p: 'Information pursuant to §5 DDG / §18 MStV.' },
        { h: 'Responsible (Verantwortlich)' },
        { p: 'Lionel Backmann' },
        { p: ADDRESS },
        { p: 'E-mail: ' + EMAIL },
        { p: 'This is a non-commercial, free project; no commercial activity and no VAT obligation.' },
        { p: 'Responsible for content per §18(2) MStV: Lionel Backmann (address above).' },
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      tab: 'Privacy',
      blocks: [
        { h: 'Who is responsible (controller)' },
        { p: 'Lionel Backmann, ' + EMAIL + ', ' + ADDRESS + '.' },
        { h: 'What this service is' },
        { p: 'mycongregation.org is a closed application for the internal organization of a religious congregation. Access is granted only to people who have an account and have given written consent to the processing of their data. The application is not accessible to outsiders.' },
        { h: 'Data processed' },
        { li: [
          'Account: e-mail, password (stored only as a hash), role, interface language, last login/activity time.',
          'Publisher data: first, middle and last name, gender, date of birth, phone, e-mail, address (phone, e-mail and address are encrypted in the database), appointment, baptism and ministry-start dates, pioneer status, activity, capabilities, public-talk numbers, organizational notes.',
          'Organizational data: assignments, absences, field-service reports (hours, Bible studies), duties, talk exchanges, special events.',
          'Technical data: push / web-push tokens; an audit log of "who changed what".',
        ] },
        { h: 'Special categories (Art. 9 GDPR)' },
        { p: 'As the data concern members of a religious congregation, they relate to religious beliefs (a special category). The legal basis is the data subject\u2019s explicit consent (a signed form), Art. 9(2)(a), within the legitimate activities of a religious body regarding its members (Art. 9(2)(d)). Free-text fields ("notes") are for organizational remarks only; sensitive information should not be entered there.' },
        { h: 'Purposes and legal bases' },
        { li: [
          'Organizing meetings, assignments and ministry — consent (Art. 6(1)(a)) and the legitimate interest of the congregation (Art. 6(1)(f)); for religious data Art. 9(2)(a)/(d).',
          'Account, login and security — Art. 6(1)(b)/(f).',
        ] },
        { h: 'Recipients (processors)' },
        { li: [
          'Hetzner Online GmbH (Germany) — hosting, database, backups; data within the EU.',
          'Cloudflare, Inc. (USA) — CDN/proxy/protection; processes IP and request metadata. Transfer outside the EU under Standard Contractual Clauses and/or the EU-US Data Privacy Framework.',
          'Push delivery via browser and OS push services (Google, Mozilla, Apple) and Expo (for mobile builds).',
          'E-mail is sent from an own server on Hetzner infrastructure.',
          'No advertising, analytics or tracking.',
        ] },
        { h: 'Retention' },
        { li: [
          'Member data — while the person is active in the congregation; afterwards deleted/anonymized within a reasonable period.',
          'Account — while active.',
          'Audit log — 12 months.',
          'Backups — within the rotation cycle.',
        ] },
        { h: 'Security (Art. 32 GDPR)' },
        { p: 'Contact data and notes are encrypted in the database; passwords and reset tokens are stored only as hashes; access is role-based; hosting in the EU; regular backups; access only for authorized users over a secure connection.' },
        { h: 'Your rights' },
        { p: 'You have the right to access, rectification, erasure, restriction, portability, objection, and to withdraw consent at any time (without affecting the lawfulness of prior processing). Requests to ' + EMAIL + '. You may lodge a complaint with a supervisory authority (for NRW: LDI NRW).' },
        { h: 'Minors' },
        { p: 'If members are minors, their data are processed with the consent of their legal guardians.' },
        { h: 'Changes' },
        { p: 'Current version: ' + LEGAL_UPDATED + '. Users are informed of material changes in the application.' },
      ],
    },
    terms: {
      title: 'Terms of Use',
      tab: 'Terms',
      blocks: [
        { h: 'Purpose' },
        { p: 'The service is a tool for the internal organization of the congregation; access is granted by invitation from an authorized person.' },
        { h: 'Account' },
        { p: 'Access is personal; credentials must not be shared with third parties. The user is responsible for keeping the password confidential.' },
        { h: 'Acceptable use' },
        { p: 'Data may be used only for lawful organizational purposes of the congregation. Extracting, copying or distributing other people\u2019s data outside these purposes is prohibited.' },
        { h: 'No warranty / liability' },
        { p: 'The service is provided "as is" (AGPL-3.0 license), without warranty of uninterrupted operation or fitness for a particular purpose. The operator\u2019s liability is limited to the extent permitted by law; the operator is not liable for indirect or incidental damages to the extent permitted by law.' },
        { h: 'Suspension of access' },
        { p: 'The operator may restrict or suspend access in case of a breach of these terms.' },
        { h: 'Open source' },
        { p: 'The service is distributed under the GNU AGPL-3.0; the source code is available:' },
        { li: ['Server: ' + REPO_SERVER, 'App: ' + REPO_APP] },
        { h: 'Governing law' },
        { p: 'The law of the Federal Republic of Germany applies. In case of discrepancy between language versions, the German version prevails.' },
      ],
    },
    disclaimer: {
      title: 'Independence notice',
      tab: 'Notice',
      blocks: [
        { p: 'mycongregation.org is an independent, unofficial tool. It is not connected with, endorsed by, or affiliated with the Watch Tower Bible and Tract Society of Pennsylvania, the Wachtturm Bibel- und Traktat-Gesellschaft, or jw.org.' },
        { p: 'The service does not use their official trademarks, logos or visual identity. Any references to publications serve solely to make organizing meetings easier and imply no official connection or endorsement.' },
      ],
    },
  },
};
