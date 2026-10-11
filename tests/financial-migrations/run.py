"""Runs real SQL only in a newly initialized, disposable LOCAL PostgreSQL cluster.

Usage: python3 tests/financial-migrations/run.py
Requires initdb, pg_ctl, psql; root runs the cluster as the sandbox's lovable user.
No application connection configuration, credentials, or production data are used.
"""
from pathlib import Path
import concurrent.futures
import os
import pwd
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OWNER = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env['HOME'] = '/tmp'
prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', '--'] if os.getuid() == 0 else []
workspace = Path(tempfile.mkdtemp(prefix='month-check-sql-', dir='/tmp'))
if prefix:
    user = pwd.getpwnam('lovable')
    os.chown(workspace, user.pw_uid, user.pw_gid)
data = workspace / 'data'
port = '55439'
connection = ['psql', '-X', '-h', str(workspace), '-p', port, '-U', 'lovable' if prefix else pwd.getpwuid(os.getuid()).pw_name,
              '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt']
passed = 0

def sql(statement, authenticated=True, failure=None):
    global passed
    session = f"SET request.jwt.claim.sub='{OWNER}'; SET ROLE authenticated;" if authenticated else ''
    result = subprocess.run(connection, input=session + statement, text=True, capture_output=True, env=env)
    if failure:
        assert result.returncode != 0 and failure in result.stderr, result.stdout + result.stderr
        passed += 1
        return ''
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ''

def expect(statement, value):
    global passed
    assert sql(statement) == value, statement
    passed += 1

def load(path):
    result = subprocess.run(connection + ['--single-transaction', '-f', str(path)], text=True, capture_output=True, env=env)
    assert result.returncode == 0, str(path) + '\n' + result.stderr

def key():
    return str(uuid.uuid4())

try:
    subprocess.run(prefix + ['initdb', '-D', str(data), '-A', 'trust', '--no-locale'], check=True, env=env, stdout=subprocess.DEVNULL)
    subprocess.run(prefix + ['pg_ctl', '-D', str(data), '-l', str(workspace/'postgres.log'),
                            '-o', f"-k {workspace} -p {port} -c listen_addresses=''", '-w', 'start'],
                   check=True, env=env, stdout=subprocess.DEVNULL)
    load(HERE/'fixture.sql')
    load(ROOT/'drizzle/migrations/0001_invoice_personal_responsibility.sql')
    # Preserve a legacy balance and an unbounded personal numeric value exactly.
    sql(f"INSERT INTO ativos(id,user_id,nome,saldo_atual) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{OWNER}','Reserva',1234.56);", False)
    sql(f"INSERT INTO month_check_rows(user_id,year,month,tipo,valor) VALUES ('{OWNER}',2026,10,'saida',10);", False)
    before = sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM month_check_rows r;", False)
    migrations = sorted((ROOT/'supabase/migrations').glob('2026101*.sql'))
    assert len(migrations) == 6
    for migration in migrations:
        load(migration)
        print('PASS sequence:', migration.name)
    assert before == sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM month_check_rows r;", False)
    expect("SELECT saldo_atual::text FROM ativos LIMIT 1;", '1234.56')
    expect("SELECT count(*) FROM pg_constraint WHERE conname='financial_movements_id_user_id_key';", '1')
    expect("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('financial_accounts','financial_movements','financial_transfers','credit_cards','credit_card_invoices','credit_card_payments','credit_card_invoice_items','benefit_wallet_events','investment_cash_operations','financial_account_reconciliations','financial_transfer_cancellations','investment_valuations','investment_operation_reversals') AND c.relrowsecurity;", '13')
    expect("SELECT atttypmod::text FROM pg_attribute WHERE attrelid='month_check_rows'::regclass AND attname='invoice_personal_value';", '-1')
    expect("SELECT invoice_payment::text FROM month_check_rows LIMIT 1;", 'false')
    account = sql(f"INSERT INTO financial_accounts(user_id,name,account_type,opening_balance,opening_balance_date) VALUES ('{OWNER}','Banco','bank_account',1000,'2026-10-01') RETURNING id;")
    wallet = sql(f"INSERT INTO financial_accounts(user_id,name,account_type) VALUES ('{OWNER}','VA','benefit_wallet') RETURNING id;")
    asset = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ordinary = sql(f"SELECT create_financial_movement('{account}','2026-10-02','expense','10','Original');")
    sql(f"SELECT update_financial_movement('{ordinary}','{account}','2026-10-02','expense','12','Alterada');")
    expect(f"SELECT description||':'||amount FROM financial_movements WHERE id='{ordinary}';", 'Alterada:12.00')
    sql(f"SELECT delete_financial_movement('{ordinary}');")
    expect(f"SELECT count(*) FROM financial_movements WHERE id='{ordinary}';", '0')
    contribution_key = key()
    contribution_call = f"SELECT record_investment_contribution('{asset}','{account}','2026-10-03','2','50','0','Aporte','{contribution_key}');"
    contribution = sql(contribution_call)
    expect(contribution_call, contribution)
    for old, new in [("'2'", "'1'"), ("'50'", "'100'"), ("'0'", "'1'"), ("'Aporte'", "'Outro'"), ("'2026-10-03'", "'2026-10-04'")]:
        sql(contribution_call.replace(old,new), failure='different investment request')
    movement = sql(f"SELECT financial_movement_id FROM investment_cash_operations WHERE id='{contribution}';")
    sql(f"SELECT delete_financial_movement('{movement}');", failure='cannot be edited or deleted')
    sql(f"SELECT update_financial_movement('{movement}','{account}','2026-10-03','expense','200','Invalida');", failure='cannot be edited or deleted')
    redemption_key = key()
    redemption_call = f"SELECT record_investment_redemption('{asset}','{account}','2026-10-04','30','Resgate','{redemption_key}');"
    redemption = sql(redemption_call)
    expect(redemption_call, redemption)
    sql(redemption_call.replace("'30'", "'31'"), failure='different investment request')
    sql(redemption_call.replace(redemption_key,contribution_key), failure='different investment request')
    dividend = sql(f"INSERT INTO proventos(user_id,ativo_id,data_recebimento,valor) VALUES ('{OWNER}','{asset}','2026-10-05',20) RETURNING id;")
    receipt_key = key()
    receipt_call = f"SELECT record_investment_dividend_receipt('{asset}','{dividend}','{account}','{receipt_key}');"
    receipt = sql(receipt_call)
    expect(receipt_call,receipt)
    sql(receipt_call.replace(dividend,key()), failure='different investment request')
    sql(receipt_call.replace(account,wallet), failure='different investment request')
    # Equal concurrent requests must return one operation and one cash movement.
    concurrent_key = key()
    concurrent_call = redemption_call.replace(redemption_key,concurrent_key)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: sql(concurrent_call), range(2)))
    assert results[0] == results[1]
    expect(f"SELECT count(*) FROM investment_cash_operations WHERE idempotency_key='{concurrent_key}';", '1')
    reversal = sql(f"SELECT reverse_investment_cash_operation('{redemption}','2026-10-06','Correção');")
    compensating = sql(f"SELECT compensating_movement_id FROM investment_operation_reversals WHERE id='{reversal}';")
    sql(f"SELECT delete_financial_movement('{compensating}');", failure='cannot be edited or deleted')
    sql(f"SELECT update_financial_movement('{compensating}','{account}','2026-10-06','expense','31','Invalida');", failure='cannot be edited or deleted')
    sql(f"UPDATE investment_operation_reversals SET reason='Outra' WHERE id='{reversal}';", False, failure='immutable audit records')
    sql(f"SELECT reverse_investment_cash_operation('{redemption}','2026-10-06','Outra');", failure='already reversed')
    expect("SELECT count(*) FROM month_check_rows;", '1')
    card = sql(f"SELECT save_credit_card(NULL,'Cartão',NULL,'BRL','{account}',20,25);")
    invoice = sql(f"SELECT create_credit_card_invoice('{card}','2026-10-02','2026-11-01',NULL,NULL,'100');")
    def purchase():
        return sql(f"INSERT INTO month_check_rows(user_id,year,month,tipo,valor,transaction_date) VALUES ('{OWNER}',2026,10,'saida',25,'2026-10-07') RETURNING id;")
    row = purchase()
    event = sql(f"SELECT record_benefit_wallet_event('{wallet}','2026-10-07','benefit_purchase','25','Mercado',NULL,'{row}','{key()}');")
    sql(f"SELECT associate_credit_card_invoice_row('{invoice}','{row}');", failure='both a credit card and a benefit wallet')
    sql(f"SELECT unlink_benefit_budget_row('{event}');")
    sql(f"SELECT associate_credit_card_invoice_row('{invoice}','{row}');")
    sql(f"SELECT record_benefit_wallet_event('{wallet}','2026-10-07','benefit_purchase','25','Mercado',NULL,'{row}','{key()}');", failure='unlinked expense')
    # Owner isolation and no direct writes into operation ledgers.
    sql(f"SET request.jwt.claim.sub='{OTHER}'; SELECT reverse_investment_cash_operation('{contribution}','2026-10-08','Outra conta');", failure='not found')
    sql("INSERT INTO investment_cash_operations DEFAULT VALUES;", failure='permission denied')
    print(f'PASS {passed} SQL regression assertions; synthetic dependencies and six migrations only; production untouched.')
finally:
    if data.exists():
        subprocess.run(prefix + ['pg_ctl','-D',str(data),'-m','immediate','stop'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    import shutil
    shutil.rmtree(workspace)