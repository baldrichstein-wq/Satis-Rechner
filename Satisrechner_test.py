import sqlite3
import hashlib

# --- Datenbank Setup ---
DB_NAME = "satisfactory_recipes_test.db"
current_user = None  # Speichert {"id": id, "name": username, "role": role}

def hash_password(password):
    """Erstellt einen SHA-256 Hash des Passworts."""
    return hashlib.sha256(password.encode()).hexdigest()

def init_db():
    """Initialisiert die Datenbank mit Tabellen für Rezepte und User."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            output_items TEXT NOT NULL,
            input_items TEXT NOT NULL,
            building TEXT NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')
    
    # Standard-Admin erstellen
    cursor.execute('SELECT count(*) FROM users')
    if cursor.fetchone()[0] == 0:
        admin_pw = hash_password("Cleanhunter01")
        cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
                       ('admin', admin_pw, 'admin'))
        print("Standard-Admin erstellt: admin / Cleanhunter01")

    # Standardrezepte (Beispiele für Alternativen hinzugefügt)
    cursor.execute('SELECT count(*) FROM recipes')
    if cursor.fetchone()[0] == 0:
        default_recipes = [
            ('Eisenbarren', 'Eisenbarren:30.0', 'Eisenerz:30.0', 'Schmelzofen'),
            ('Alternatives Rezept: Gusseisenschrauben', 'Schrauben:50.0', 'Eisenbarren:12.5', 'Constructor'),
            ('Eisenstangen', 'Eisenstangen:15.0', 'Eisenbarren:15.0', 'Constructor'),
            ('Eisenplatten', 'Eisenplatten:20.0', 'Eisenbarren:30.0', 'Constructor'),
            ('Schrauben', 'Schrauben:40.0', 'Eisenstangen:10.0', 'Constructor'),
            ('AluminiumSchrott', 'AluminiumSchrott:360.0,Wasser:120.0', 'Kohle:120.0,Aluminiumoxid:240.0', 'Raffinerie')
        ]
        cursor.executemany('INSERT INTO recipes (name, output_items, input_items, building) VALUES (?, ?, ?, ?)', default_recipes)
    
    conn.commit()
    conn.close()

# --- Authentifizierung ---
def login():
    global current_user
    print("\n--- Login ---")
    username = input("Benutzername: ")
    password = input("Passwort: ")
    hashed = hash_password(password)

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, role FROM users WHERE username = ? AND password = ?', (username, hashed))
    user = cursor.fetchone()
    conn.close()

    if user:
        current_user = {"id": user[0], "name": user[1], "role": user[2].lower()}
        print(f"\nWillkommen, {user[1]}! (Rolle: {user[2]})")
        return True
    else:
        print("\nLogin fehlgeschlagen. Falscher Name oder Passwort.")
        return False

def register():
    print("\n--- Registrierung ---")
    username = input("Wähle einen Benutzernamen: ").strip()
    if not username:
        print("Name darf nicht leer sein.")
        return False
    
    password = input("Wähle ein Passwort: ")
    if len(password) < 3:
        print("Passwort zu kurz (min. 3 Zeichen).")
        return False
    
    hashed = hash_password(password)
    role = "user"

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
                       (username, hashed, role))
        conn.commit()
        print(f"\nAccount für '{username}' erstellt! Logge dich nun ein.")
        return True
    except sqlite3.IntegrityError:
        print("\nFehler: Name bereits vergeben.")
        return False
    finally:
        conn.close()

# --- Berechtigungs-Prüfungen ---
def require_admin():
    if current_user and current_user['role'] == 'admin':
        return True
    print("\n[ZUGRIFF VERWEIGERT] Erfordert Admin-Rechte.")
    return False

def can_edit():
    if current_user and current_user['role'] in ['admin', 'moderator']:
        return True
    print("\n[ZUGRIFF VERWEIGERT] Erfordert Moderator- oder Admin-Rechte.")
    return False

# --- Benutzerverwaltung ---
def delete_user():
    if not require_admin(): return
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, role FROM users')
    users = cursor.fetchall()
    for u in users: print(f"ID: {u[0]} | Name: {u[1]:<15} | Rolle: {u[2]}")
    try:
        uid = int(input("\nID zum Löschen (0 zum Abbrechen): "))
        if uid == 0: return
        if uid == current_user['id']:
            print("Fehler: Du kannst dich nicht selbst löschen!")
            return
        cursor.execute('DELETE FROM users WHERE id = ?', (uid,))
        conn.commit()
        print("Gelöscht.")
    except: print("Fehler.")
    finally: conn.close()

# --- Rezept-Funktionen ---


def get_all_recipes():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM recipes')
    rows = cursor.fetchall()
    conn.close()
    return rows

def show_sub_recipes(item_name, depth=3):
    """Sucht rekursiv nach Rezepten für ein bestimmtes Item."""
    indent = "  " * depth
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Suche Rezepte, die dieses Item als Output haben
    cursor.execute("SELECT name, input_items, building FROM recipes WHERE output_items LIKE ?", (f'%{item_name}%',))
    sub_recipes = cursor.fetchall()
    conn.close()

    if sub_recipes:
        for name, in_items, building in sub_recipes:
            print(f"{indent}Lösungsweg für {item_name}: {name} ({building})")
            # Optional: Zeige auch die Inputs des Unterrezepts
            for pair in in_items.split(','):
                if ':' in pair:
                    it, _ = pair.split(':')
                    # Rekursion deaktiviert um Endlosschleifen zu vermeiden, 
                    # kann aber mit Tiefenbegrenzung aktiviert werden.
                    print(f"{indent}  -> Benötigt: {it}")
    else:
        print(f"{indent}(Kein Rezept für {item_name} in DB gefunden - Rohstoff?)")

def perform_calculation(recipe_row):
    """Hilfsfunktion für die Berechnung inklusive Bedarfsanzeige und Vorketten."""
    try:
        rid, name, out_str, in_str, building = recipe_row
        
        first_output = out_str.split(',')[0]
        main_out_name, main_out_qty = first_output.split(':')
        
        desired = float(input(f"\nGewünschte Menge {main_out_name}/Min: "))
        factor = desired / float(main_out_qty)
        
        print("-" * 50)
        print(f"PRODUKTION: {name.upper()}")
        print(f"Benötigte Gebäude: {building} x {factor:.2f}")
        print("-" * 50)
        
        print("PRODUZIERTE ITEMS (Output):")
        for pair in out_str.split(','):
            if ':' in pair:
                it, qty = pair.split(':')
                print(f"  + {it}: {float(qty)*factor:.2f}/min")
        
        print("\nBENÖTIGTE RESSOURCEN & HERSTELLUNG:")
        for pair in in_str.split(','):
            if ':' in pair:
                it, qty = pair.split(':')
                total_needed = float(qty) * factor
                print(f"\n> {it}: {total_needed:.2f}/min benötigt")
                # NEU: Hier rufen wir die Suche nach dem Rezept für den Input auf
                show_sub_recipes(it)
        
        print("-" * 50)

        while True:
            wait = input("\nDrücke 'q' und Enter, um zum Menü zurückzukehren: ").lower()
            if wait == 'q':
                break

    except Exception as e:
        print(f"Fehler bei der Berechnung: {e}")
        input("\nDrücke Enter, um fortzufahren...")
        
def calculate_recipe():
    recipes = get_all_recipes()
    if not recipes: return
    
    print("\n--- Standard Berechnung ---")
    for r in recipes: print(f"[{r[0]}] {r[1]}")
    try:
        rid = int(input("\nRezept ID wählen: "))
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM recipes WHERE id = ?', (rid,))
        res = cursor.fetchone()
        conn.close()
        if res: perform_calculation(res)
    except ValueError: print("Ungültige ID.")

def calculate_alternative_recipe():
    """Sucht nach allen Rezepten, die ein bestimmtes Item produzieren."""
    item_name = input("\nWelches Item möchtest du herstellen? (z.B. Schrauben): ").strip()
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Sucht in der Spalte output_items nach dem Namen
    cursor.execute("SELECT * FROM recipes WHERE output_items LIKE ?", (f'%{item_name}%',))
    results = cursor.fetchall()
    conn.close()
    
    if not results:
        print(f"Keine Rezepte für '{item_name}' gefunden.")
        return

    print(f"\n--- Verfügbare Rezepte für {item_name} ---")
    for i, r in enumerate(results):
        print(f"{i+1}. {r[1]} (Gebäude: {r[4]})")
    
    try:
        choice = int(input("\nWähle eine Option (Zahl): ")) - 1
        if 0 <= choice < len(results):
            perform_calculation(results[choice])
        else:
            print("Ungültige Wahl.")
    except ValueError:
        print("Bitte eine Zahl eingeben.")

def add_recipe():
    if not require_admin(): return
    print("\n--- Neues Rezept hinzufügen ---")
    name = input("Rezept Name: ")
    output_items = input_multiple_items("Ausgabe-Item")
    input_items = input_multiple_items("Zutat")
    building = input("Gebäude: ")
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO recipes (name, output_items, input_items, building) VALUES (?, ?, ?, ?)', 
                   (name, output_items, input_items, building))
    conn.commit()
    conn.close()
    print("Rezept hinzugefügt!")

def delete_recipe():
    if not require_admin(): return
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, building FROM recipes')
    recipes = cursor.fetchall()
    if not recipes:
        print("Keine Rezepte vorhanden.")
        conn.close()
        return
    for r in recipes: print(f"ID: {r[0]} | Name: {r[1]:<30} | Gebäude: {r[2]}")
    try:
        rid = int(input("\nID zum Löschen (0 zum Abbrechen): "))
        if rid == 0: return
        cursor.execute('DELETE FROM recipes WHERE id = ?', (rid,))
        conn.commit()
        print("Rezept gelöscht.")
    except: print("Fehler.")
    finally: conn.close()

def input_multiple_items(prompt_type):
    items_list = []
    print(f"\n--- {prompt_type} eingeben (Beenden mit 'fertig') ---")
    while True:
        name = input(f"{prompt_type} Name: ").strip()
        if name.lower() == 'fertig': break
        if not name: continue
        qty = input(f"Menge von {name} pro Min: ")
        items_list.append(f"{name}:{qty}")
    return ",".join(items_list)

def edit_recipe():
    recipes = get_all_recipes()
    if not recipes:
        print("\nKeine Rezepte zum Bearbeiten vorhanden.")
        return

    print("\n--- Rezept bearbeiten ---")
    for r in recipes:
        print(f"[{r[0]}] {r[1]} (Produziert: {r[2]})")
    
    try:
        user_input = input("\nID des zu bearbeitenden Rezepts (0 zum Abbrechen): ")
        if not user_input or int(user_input) == 0: return
        recipe_id = int(user_input)

        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM recipes WHERE id = ?', (recipe_id,))
        old = cursor.fetchone()

        if not old:
            print("ID nicht gefunden.")
            conn.close()
            return

        print(f"\nBearbeite '{old[1]}'. Tipp: ENTER drücken, um alten Wert zu behalten.")
        new_name = input(f"Name [{old[1]}]: ") or old[1]
        new_building = input(f"Gebäude [{old[4]}]: ") or old[4]

        new_output_items = old[2]
        if input(f"Ausgaben neu definieren? (Aktuell: {old[2]}) (j/n): ").lower() == 'j':
            new_output_items = input_multiple_items("Ausgabe-Item")

        new_input_items = old[3]
        if input(f"Zutaten neu definieren? (Aktuell: {old[3]}) (j/n): ").lower() == 'j':
            new_input_items = input_multiple_items("Zutat")

        cursor.execute('''
            UPDATE recipes 
            SET name = ?, output_items = ?, input_items = ?, building = ?
            WHERE id = ?
        ''', (new_name, new_output_items, new_input_items, new_building, recipe_id))
        
        conn.commit()
        conn.close()
        print("\nRezept erfolgreich aktualisiert!")
    except ValueError:
        print("Ungültige Eingabe.")

def manage_users():
    if not require_admin(): return
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, role FROM users')
    users = cursor.fetchall()
    for u in users: print(f"ID: {u[0]} | Name: {u[1]:<15} | Rolle: {u[2]}")
    try:
        uid = int(input("\nID zur Rollenänderung: "))
        new_role = input("Neue Rolle (user/moderator/admin): ").lower()
        cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, uid))
        conn.commit()
        print("Rolle aktualisiert.")
    except: print("Fehler.")
    finally: conn.close()

# --- Hauptmenü ---
def main_menu():
    init_db()
    global current_user
    
    running = True
    while running:
        if not current_user:
            print("\n--- Satisfactory Rechner ---")
            print("1. Login")
            print("2. Registrieren")
            print("3. Beenden")
            choice = input("Wahl:")
            if choice == '1': login()
            elif choice == '2': register()
            elif choice == '3': running = False
        else:
            role = current_user['role']
            print(f"\n--- Hauptmenü ({current_user['name']} | {role}) ---")
            print("1. Rezept berechnen (Liste)")
            print("2. Berechnen mit Alternativen (Suche nach Item)")
            
            if role in ['admin', 'moderator']:
                print("3. Rezept bearbeiten")
            
            if role == 'admin':
                print("4. Rezept hinzufügen")
                print("5. Rezept löschen")
                print("6. Benutzerrollen verwalten")
                print("7. Benutzer löschen")
            
            print("8. Logout")
            print("9. Beenden")
            
            choice = input("Auswahl: ")
            
            if choice == '1':
                calculate_recipe()
            elif choice == '2':
                calculate_alternative_recipe()
            elif choice == '3' and role in ['admin', 'moderator']:
                edit_recipe() # <--- Hier die Funktion aufrufen statt nur print()
                print("Bearbeitungs-Funktion aufgerufen...")
            elif choice == '4' and role == 'admin':
                add_recipe()
            elif choice == '5' and role == 'admin':
                delete_recipe() # <--- Ruft das Löschen von Rezepten auf
            elif choice == '6' and role == 'admin':
                manage_users() # <--- Ruft die Rollenänderung auf
            elif choice == '7' and role == 'admin':
                delete_user() # <--- Ruft das Löschen von Usern auf
            elif choice == '8':
                current_user = None
            elif choice == '9':
                running = False

    print("Programm beendet.")

if __name__ == "__main__":
    main_menu()