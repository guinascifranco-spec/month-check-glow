"""Runs real SQL only in a newly initialized, disposable LOCAL PostgreSQL cluster.

Usage: python3 tests/financial-migrations/run.py
Local hypothesis only: add --probe-parent-write (does not fix repository migrations).
Approved additive candidate: add --test-isolation-guard (local only).
Requires initdb, pg_ctl, psql; root runs the cluster as the sandbox's lovable user.
No application connection configuration, credentials, or production data are used.
"""
from pathlib import Path
import argparse
import concurrent.futures
import os
import pwd
import subprocess
import tempfile
import uuid
import time

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
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--probe-parent-write', action='store_true',
                    help='Experiment with a shared-parent write ONLY in the disposable local cluster; never an approval of the repository migrations')
parser.add_argument('--test-isolation-guard', action='store_true',
                    help='Test the approved additive isolation guard ONLY in the disposable cluster')
options = parser.parse_args()
assert not (options.probe_parent_write and options.test_isolation_guard), 'Choose one guard strategy'

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

def association_race(winner, loser, label, authenticated=True, isolation='READ COMMITTED'):
    """Hold a committed-to-be link; observe the second session actually waiting."""
    session = f"SET request.jwt.claim.sub='{OWNER}';" + ('SET ROLE authenticated;' if authenticated else '')
    tag = 'month_check_race_' + key()
    first = subprocess.Popen(connection, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    first.stdin.write(session + f"SET application_name='{tag}'; BEGIN ISOLATION LEVEL {isolation};" + winner + 'SELECT pg_sleep(1.5); COMMIT;')
    first.stdin.close()
    deadline = time.monotonic() + 5
    while sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{tag}' AND wait_event='PgSleep';", False) != '1':
        assert time.monotonic() < deadline, 'winner never acquired association'
        time.sleep(.02)
    second = subprocess.Popen(connection, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    second.stdin.write(session + f"SET application_name='{tag}_loser'; BEGIN ISOLATION LEVEL {isolation}; SELECT count(*) FROM credit_card_invoice_items;" + loser + 'COMMIT;')
    second.stdin.close()
    deadline = time.monotonic() + 1
    while sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{tag}_loser' AND wait_event_type='Lock';", False) != '1':
        assert time.monotonic() < deadline, 'loser did not wait on the actual transaction'
        time.sleep(.02)
    first.wait(timeout=10)
    second.wait(timeout=10)
    assert first.returncode == 0, first.stderr.read()
    error = second.stderr.read()
    if isolation == 'READ COMMITTED':
        assert second.returncode != 0 and ('both a credit card and a benefit wallet' in error or 'unlinked expense' in error), error
        print('PASS concurrent association:', label)
    else:
        assert second.returncode != 0 and 'could not serialize access due to concurrent update' in error, \
            f'INTEGRITY BLOCKER: {label}; expected serialization failure, got: {error or "loser accepted"}'
        print('PASS concurrent association:', label, '/ serialization failure')
    return second.returncode

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
        if options.test_isolation_guard and migration.name == '20261013220000_benefit_wallets.sql':
            load(HERE/'purchase-isolation-guard.sql')
            print('PASS candidate additive isolation guard immediately after M4')
    if options.probe_parent_write:
        # Hypothesis in memory only, NOT a migration file or production operation.
        # Default execution above/below always tests the unmodified repository.
        definition_result = subprocess.run(connection, input="SELECT pg_get_functiondef('public.guard_exclusive_purchase_link()'::regprocedure);",
                                           text=True, capture_output=True, env=env)
        assert definition_result.returncode == 0, definition_result.stderr
        definition = definition_result.stdout
        old = "PERFORM 1 FROM public.month_check_rows\n    WHERE id = NEW.month_check_row_id AND user_id = NEW.user_id FOR UPDATE;"
        new = "UPDATE public.month_check_rows SET id = id\n    WHERE id = NEW.month_check_row_id AND user_id = NEW.user_id;"
        assert definition.count(old) == 1, 'Probe no longer matches repository guard; do not silently test other SQL'
        sql(definition.replace(old, new), False)
        print('EXPERIMENT ONLY: shared parent write installed in disposable cluster; repository migration unchanged')
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
    # All investment RPCs above (including reversals) left budget history unchanged.
    assert before == sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM month_check_rows r;", False)
    expect(f"SELECT sum(amount * CASE movement_type WHEN 'expense' THEN -1 ELSE 1 END)::text FROM financial_movements WHERE account_id='{account}';", '-50.00')
    cash_before = sql(f"SELECT calculated_balance FROM financial_account_balances('2026-10-08') WHERE account_id='{account}';")
    second_account = sql(f"INSERT INTO financial_accounts(user_id,name,account_type,opening_balance,opening_balance_date) VALUES ('{OWNER}','Reserva','bank_account',500,'2026-10-01') RETURNING id;")
    transfer = sql(f"SELECT create_financial_transfer('{account}','{second_account}','2026-10-08','75','Reserva');")
    expect(f"SELECT calculated_balance FROM financial_account_balances('2026-10-08') WHERE account_id='{account}';", '875.00')
    expect(f"SELECT calculated_balance FROM financial_account_balances('2026-10-08') WHERE account_id='{second_account}';", '575.00')
    expect("SELECT count(*) FROM month_check_rows;", '1')
    sql(f"SELECT cancel_financial_transfer_with_reason('{transfer}','Correção');")
    expect(f"SELECT calculated_balance FROM financial_account_balances('2026-10-08') WHERE account_id='{account}';", cash_before)
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
    for isolation in ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']:
        for benefit_first in [False, True]:
            for privileged in [False, True]:
                race_row = purchase()
                row_before = sql(f"SELECT to_jsonb(r)::text FROM month_check_rows r WHERE id='{race_row}';", False)
                movements_before = sql('SELECT count(*) FROM financial_movements;', False)
                credit_call = f"SELECT associate_credit_card_invoice_row('{invoice}','{race_row}');"
                benefit_call = f"SELECT record_benefit_wallet_event('{wallet}','2026-10-07','benefit_purchase','25','Mercado',NULL,'{race_row}','{key()}');"
                if privileged:
                    credit_call = f"INSERT INTO credit_card_invoice_items(user_id,invoice_id,month_check_row_id) VALUES ('{OWNER}','{invoice}','{race_row}');"
                    benefit_movement = sql(f"SELECT record_benefit_wallet_event('{wallet}','2026-10-07','benefit_purchase','25','Mercado',NULL,NULL,'{key()}');")
                    # Bypass the RPC's preliminary check: the storage guard must
                    # also protect a privileged UPDATE introducing a link.
                    benefit_call = f"UPDATE benefit_wallet_events SET month_check_row_id='{race_row}' WHERE movement_id='{benefit_movement}';"
                    movements_before = sql('SELECT count(*) FROM financial_movements;', False)
                if options.test_isolation_guard and isolation != 'READ COMMITTED':
                    for call in [credit_call, benefit_call]:
                        sql(f'BEGIN ISOLATION LEVEL {isolation};' + call + 'COMMIT;', not privileged,
                            failure='Purchase associations require READ COMMITTED isolation')
                    expect(f"SELECT (SELECT count(*) FROM credit_card_invoice_items WHERE month_check_row_id='{race_row}') + (SELECT count(*) FROM benefit_wallet_events WHERE month_check_row_id='{race_row}');", '0')
                    assert movements_before == sql('SELECT count(*) FROM financial_movements;', False), 'Rejected association left a cash movement'
                    assert row_before == sql(f"SELECT to_jsonb(r)::text FROM month_check_rows r WHERE id='{race_row}';", False), 'Rejected association changed budget row or updated_at'
                    print('PASS isolation refused without side effects:', isolation, benefit_first, privileged)
                    continue
                association_race(benefit_call if benefit_first else credit_call, credit_call if benefit_first else benefit_call,
                                 isolation + (' / benefit first' if benefit_first else ' / card first') +
                                 (' / privileged' if privileged else ' / authenticated'), not privileged, isolation)
                expect(f"SELECT (SELECT count(*) FROM credit_card_invoice_items WHERE month_check_row_id='{race_row}') + (SELECT count(*) FROM benefit_wallet_events WHERE month_check_row_id='{race_row}');", '1')
                if options.test_isolation_guard:
                    assert row_before == sql(f"SELECT to_jsonb(r)::text FROM month_check_rows r WHERE id='{race_row}';", False), 'Association changed budget row or updated_at'
    # The winner's financial fields must survive the tuple-version write.
    expect(f"SELECT tipo||':'||valor||':'||transaction_date FROM month_check_rows WHERE id='{race_row}';", 'saida:25:2026-10-07')
    sql(f"SELECT close_credit_card_invoice('{invoice}');")
    sql(f"SELECT record_credit_card_payment('{invoice}','{account}','2026-11-02','50','{key()}');")
    expect(f"SELECT calculated_balance FROM financial_account_balances('2026-11-01') WHERE account_id='{account}';", cash_before)
    expect(f"SELECT calculated_balance FROM financial_account_balances('2026-11-02') WHERE account_id='{account}';", '900.00')
    # Owner isolation and no direct writes into operation ledgers.
    sql(f"SET request.jwt.claim.sub='{OTHER}'; SELECT reverse_investment_cash_operation('{contribution}','2026-10-08','Outra conta');", failure='not found')
    sql("INSERT INTO investment_cash_operations DEFAULT VALUES;", failure='permission denied')
    dual_links = sql("SELECT count(*) FROM credit_card_invoice_items i JOIN benefit_wallet_events e USING(month_check_row_id);", False)
    assert dual_links == '0', 'INTEGRITY BLOCKER: REPEATABLE READ permitted the same purchase in card and benefit ledgers'
    print(f'PASS {passed} SQL assertions; production untouched.' +
          (' Candidate guard: 4 READ COMMITTED races and 16 unsupported-isolation operations rejected; row/updated_at preserved.' if options.test_isolation_guard else
           ' LOCAL HYPOTHESIS ONLY: repository migration remains blocked/unfixed.' if options.probe_parent_write else ' Repository migrations verified.'))
finally:
    if data.exists():
        subprocess.run(prefix + ['pg_ctl','-D',str(data),'-m','immediate','stop'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    import shutil
    shutil.rmtree(workspace)