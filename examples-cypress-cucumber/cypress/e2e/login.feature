@feature:auth @owner:asha
Feature: Login

  Background:
    Given I open the login page

  @smoke @P1
  Scenario: Sign in with a valid user
    When I sign in as "asha" with password "Demo-Pass-123"
    Then I see the heading "Welcome"

  @critical @story:SHOP-7
  Scenario: A wrong password shows an error
    When I sign in as "asha" with password "Wrong-Pass-9"
    Then I see an error message
    And I stay on the login page

  Scenario Outline: Sign in as <user>
    When I sign in as "<user>" with password "<password>"
    Then I see the heading "<heading>"

    Examples:
      | user | password      | heading |
      | asha | Demo-Pass-123 | Welcome |
      | ravi | Ravi-Pass-456 | Hello   |

  Scenario: Remember me
    When I tick "Remember me"
    Then the box stays ticked
