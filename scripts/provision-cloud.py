"""Create only LearnHub's dedicated schema/account using the existing protected cloud profile."""
import json, os, secrets, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROFILE = Path(os.environ.get('LEARNHUB_CLOUD_PROFILE', str(Path.home() / '.config' / 'learnhub' / 'cloud-profile')))
sys.path.insert(0, str(PROFILE))
sys.path.insert(0, str(PROFILE / 'deps'))
from connect import protect
import pymysql

def main():
    target = ROOT / '.local' / 'database.dpapi'
    if target.exists():
        saved = json.loads(protect(target.read_bytes(), True))
        with pymysql.connect(host=saved['host'], port=saved['port'], user=saved['user'], password=saved['password'], database=saved['database'], connect_timeout=10) as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT 1')
                assert cursor.fetchone()[0] == 1
        print(json.dumps({'connected': True, 'database': saved['database'], 'account': saved['user'], 'reused': True}))
        return
    cfg = json.loads(protect((PROFILE / 'connection.dpapi').read_bytes(), True))
    account = 'learnhub_app'
    password = secrets.token_urlsafe(36)
    saved = {'host': cfg['mysql_host'], 'port': int(cfg['mysql_port']), 'user': account, 'password': password, 'database': 'learnhub'}
    target.parent.mkdir(parents=True, exist_ok=True)
    with pymysql.connect(host=cfg['mysql_host'], port=int(cfg['mysql_port']), user=cfg['mysql_user'], password=cfg['mysql_password'], connect_timeout=10, autocommit=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='learnhub'")
            if cursor.fetchone()[0]:
                raise RuntimeError('Existing nonempty learnhub schema requires inspection; no changes applied')
            cursor.execute("SELECT COUNT(*) FROM mysql.user WHERE user=%s AND host='%%'", (account,))
            if cursor.fetchone()[0]:
                raise RuntimeError('Dedicated account already exists without this project credential; refusing to replace it')
            # Save the recoverable credential before creating the cloud account. No plaintext password is written.
            target.write_bytes(protect(json.dumps(saved).encode('utf-8')))
            cursor.execute('CREATE DATABASE IF NOT EXISTS `learnhub` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
            cursor.execute("CREATE USER %s@'%%' IDENTIFIED BY %s", (account, password))
            cursor.execute("GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON `learnhub`.* TO %s@'%%'", (account,))
    with pymysql.connect(host=saved['host'], port=saved['port'], user=account, password=password, database='learnhub', charset='utf8mb4', connect_timeout=10) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT DATABASE(),VERSION()')
            database, version = cursor.fetchone()
    print(json.dumps({'connected': True, 'database': database, 'account': account, 'version': version, 'credentialStorage': 'Windows DPAPI', 'reused': False}))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'errorType': type(exc).__name__, 'code': exc.args[0] if exc.args and isinstance(exc.args[0], int) else 'PROVISION_FAILED'}))
        sys.exit(1)
