"""
Management command: seed_defaults

Idempotently seeds default categories and payment methods for every active
user who is missing any of them.  Safe to run more than once: existing rows
(matched case-insensitively) are never duplicated or overwritten.

Usage
-----
# Dry run — list affected users without writing anything:
python manage.py seed_defaults --dry-run

# Backfill all active users:
python manage.py seed_defaults

# Backfill a single specific user:
python manage.py seed_defaults --email user@example.com

Operational notes
-----------------
* Only active users (is_active=True) are processed by default.
  Pass --include-inactive to include deactivated accounts.
* Each user's seeding runs inside its own transaction.atomic() call (as
  defined in seed_user_defaults).  A failure for one user is caught and
  reported; the command continues with the remaining users.
* No existing categories or payment methods are ever modified or deleted.
* The command is idempotent: repeat runs produce no additional rows after
  the first successful run.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from khaata.apps.transactions.services import seed_user_defaults

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Idempotently seed default categories and payment methods for users "
        "who were created before BE-004 or whose defaults are missing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            default=None,
            help="Seed a single user identified by email address.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Report which users would be seeded without writing anything.",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            default=False,
            help="Also process deactivated user accounts (is_active=False).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        email_filter = options["email"]
        include_inactive = options["include_inactive"]

        # Build queryset.
        qs = User.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        if email_filter:
            qs = qs.filter(email__iexact=email_filter)
            if not qs.exists():
                raise CommandError(
                    f"No {'active ' if not include_inactive else ''}user found "
                    f"with email '{email_filter}'."
                )

        users = list(qs.order_by("email"))
        if not users:
            self.stdout.write("No users to process.")
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] Would seed defaults for {len(users)} user(s):"
                )
            )
            for u in users:
                self.stdout.write(f"  {u.email}")
            return

        ok_count = 0
        err_count = 0
        for user in users:
            try:
                seed_user_defaults(user)
                self.stdout.write(f"  seeded: {user.email}")
                ok_count += 1
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(
                    self.style.ERROR(f"  FAILED: {user.email} — {exc}")
                )
                err_count += 1

        summary = f"Done. {ok_count} succeeded"
        if err_count:
            summary += f", {err_count} failed"
            self.stdout.write(self.style.WARNING(summary))
        else:
            self.stdout.write(self.style.SUCCESS(summary))
